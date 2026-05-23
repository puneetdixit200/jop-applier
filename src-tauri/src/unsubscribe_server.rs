use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    thread,
};

use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::{
    db::{
        self,
        models::UpsertEmailOptOut,
        queries,
    },
};

const DEFAULT_UNSUBSCRIBE_ADDR: &str = "127.0.0.1:17654";

pub fn start_unsubscribe_server(database_path: PathBuf) {
    thread::spawn(move || {
        let Ok(listener) = TcpListener::bind(DEFAULT_UNSUBSCRIBE_ADDR) else {
            return;
        };
        for stream in listener.incoming().flatten() {
            let path = database_path.clone();
            thread::spawn(move || {
                let _ = handle_stream(stream, path);
            });
        }
    });
}

fn handle_stream(mut stream: TcpStream, database_path: PathBuf) -> Result<(), String> {
    let mut buffer = [0_u8; 2048];
    let read = stream.read(&mut buffer).map_err(|error| error.to_string())?;
    let request = String::from_utf8_lossy(&buffer[..read]);
    let token = request
        .lines()
        .next()
        .and_then(token_from_request_line)
        .ok_or_else(|| "missing unsubscribe token".to_string());

    match token.and_then(|token| record_unsubscribe(database_path, &token)) {
        Ok(email) => write_response(
            &mut stream,
            200,
            "OK",
            &format!("You have been unsubscribed: {email}"),
        ),
        Err(error) => write_response(&mut stream, 400, "Bad Request", &error),
    }
}

fn token_from_request_line(line: &str) -> Option<String> {
    let mut parts = line.split_whitespace();
    let method = parts.next()?;
    let target = parts.next()?;
    if method != "GET" || !target.starts_with("/unsubscribe?") {
        return None;
    }
    target
        .split_once('?')?
        .1
        .split('&')
        .find_map(|part| {
            let (key, value) = part.split_once('=')?;
            (key == "token").then(|| percent_decode(value))
        })
}

fn record_unsubscribe(database_path: PathBuf, token: &str) -> Result<String, String> {
    let email = decode_unsubscribe_token(token)?;
    let connection = db::encryption::open_application_database(&database_path)
        .map_err(|error| error.to_string())?;
    let opted_out_at = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|error| error.to_string())?;
    queries::record_email_opt_out(
        &connection,
        UpsertEmailOptOut {
            email: email.clone(),
            opted_out_at,
            reason: "unsubscribe_link".to_string(),
        },
    )
    .map_err(|error| error.to_string())?;
    Ok(email)
}

fn decode_unsubscribe_token(token: &str) -> Result<String, String> {
    let bytes = base64url_decode(token)?;
    let email = String::from_utf8(bytes)
        .map_err(|_| "invalid unsubscribe token".to_string())?
        .trim()
        .to_ascii_lowercase();
    if !is_valid_email(&email) {
        return Err("invalid unsubscribe token".to_string());
    }
    Ok(email)
}

fn write_response(stream: &mut TcpStream, status: u16, reason: &str, body: &str) -> Result<(), String> {
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\ncontent-type: text/plain; charset=utf-8\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
        body.len(),
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|error| error.to_string())
}

fn percent_decode(value: &str) -> String {
    let mut decoded = Vec::new();
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(hex) = u8::from_str_radix(&value[index + 1..index + 3], 16) {
                decoded.push(hex);
                index += 3;
                continue;
            }
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&decoded).to_string()
}

fn base64url_decode(value: &str) -> Result<Vec<u8>, String> {
    let mut bits = 0_u32;
    let mut bit_count = 0_u8;
    let mut output = Vec::new();

    for byte in value.bytes() {
        if byte == b'=' {
            break;
        }
        let sextet = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'-' => 62,
            b'_' => 63,
            _ => return Err("invalid unsubscribe token".to_string()),
        } as u32;
        bits = (bits << 6) | sextet;
        bit_count += 6;
        while bit_count >= 8 {
            bit_count -= 8;
            output.push(((bits >> bit_count) & 0xff) as u8);
        }
    }

    Ok(output)
}

fn is_valid_email(value: &str) -> bool {
    let Some((local, domain)) = value.split_once('@') else {
        return false;
    };
    !local.is_empty() && domain.contains('.') && !domain.ends_with('.')
}

#[cfg(test)]
mod tests {
    use super::decode_unsubscribe_token;

    #[test]
    fn decodes_base64url_email_tokens() {
        assert_eq!(
            decode_unsubscribe_token("cHJpeWFAc2V0dS5jbw").expect("decode token"),
            "priya@setu.co",
        );
    }
}
