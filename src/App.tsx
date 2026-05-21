import { useMemo, useState } from "react";
import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  FileText,
  Play,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";

type RouteId = "dashboard" | "jobs" | "applications" | "profile" | "settings";

type Profile = {
  name: string;
  headline: string;
  location: string;
  skills: string;
  targetRoles: string;
};

const routes: Array<{ id: RouteId; label: string; icon: typeof BarChart3 }> = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { id: "applications", label: "Applications", icon: FileText },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "settings", label: "Settings", icon: Settings },
];

const jobQueue = [
  { title: "Frontend Engineer Intern", company: "Northstar Labs", score: 91, source: "LinkedIn" },
  { title: "Rust Desktop Engineer", company: "Helio Systems", score: 87, source: "Careers" },
  { title: "AI Product Intern", company: "SignalWorks", score: 79, source: "Indeed" },
];

const applications = [
  { company: "AstraGrid", role: "React Engineer", status: "Applied", next: "Follow up Friday" },
  { company: "Mosaic AI", role: "Product Intern", status: "Preparing", next: "Resume draft" },
  { company: "DeltaStack", role: "Platform Engineer", status: "Queued", next: "Match review" },
];

const metrics = [
  { label: "Matched Jobs", value: "38", tone: "green" },
  { label: "Queued Applications", value: "12", tone: "blue" },
  { label: "Follow-ups Due", value: "4", tone: "amber" },
  { label: "AI Cache Hits", value: "64%", tone: "violet" },
];

export function App() {
  const [route, setRoute] = useState<RouteId>("dashboard");
  const [profile, setProfile] = useState<Profile>({
    name: "Deepak Kudi",
    headline: "React and TypeScript engineer",
    location: "India",
    skills: "React, TypeScript, Rust, Node.js",
    targetRoles: "Frontend Engineer, AI Product Intern, Desktop App Engineer",
  });
  const [provider, setProvider] = useState("ollama");

  const routeTitle = useMemo(() => routes.find((item) => item.id === route)?.label ?? "Dashboard", [route]);

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <h1>CareerCaveman</h1>
            <span>Local career agent</span>
          </div>
        </div>
        <nav className="nav-list">
          {routes.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={item.id === route ? "nav-item active" : "nav-item"}
                type="button"
                onClick={() => setRoute(item.id)}
                aria-current={item.id === route ? "page" : undefined}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <section className="privacy-panel" aria-label="Privacy status">
          <ShieldCheck size={18} aria-hidden="true" />
          <div>
            <strong>Local-first</strong>
            <span>Cloud AI stays opt-in.</span>
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Phase 1 foundation</p>
            <h2>{routeTitle}</h2>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" aria-label="Search">
              <Search size={18} aria-hidden="true" />
            </button>
            <button className="primary-action" type="button">
              <Play size={17} aria-hidden="true" />
              Start Discovery
            </button>
          </div>
        </header>

        {route === "dashboard" && <Dashboard provider={provider} />}
        {route === "jobs" && <Jobs />}
        {route === "applications" && <Applications />}
        {route === "profile" && <ProfileEditor profile={profile} onChange={setProfile} />}
        {route === "settings" && <SettingsPanel provider={provider} onProviderChange={setProvider} />}
      </section>
    </main>
  );
}

function Dashboard({ provider }: { provider: string }) {
  return (
    <div className="dashboard-grid">
      <section className="metric-grid" aria-label="Application metrics">
        {metrics.map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="panel wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Queue</p>
            <h3>High-match jobs</h3>
          </div>
          <Bot size={19} aria-hidden="true" />
        </div>
        <div className="job-list">
          {jobQueue.map((job) => (
            <article className="job-row" key={`${job.company}-${job.title}`}>
              <div>
                <strong>{job.title}</strong>
                <span>{job.company} · {job.source}</span>
              </div>
              <b>{job.score}</b>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Runtime</p>
            <h3>Provider</h3>
          </div>
          <CheckCircle2 size={19} aria-hidden="true" />
        </div>
        <dl className="status-list">
          <div>
            <dt>Active AI</dt>
            <dd>{provider}</dd>
          </div>
          <div>
            <dt>Browser</dt>
            <dd>Idle</dd>
          </div>
          <div>
            <dt>Database</dt>
            <dd>SQLite ready</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Schedule</p>
            <h3>Next runs</h3>
          </div>
          <CalendarClock size={19} aria-hidden="true" />
        </div>
        <ul className="timeline">
          <li><span>09:00</span> Discover weekday roles</li>
          <li><span>12:30</span> Score new jobs</li>
          <li><span>17:00</span> Draft follow-ups</li>
        </ul>
      </section>
    </div>
  );
}

function Jobs() {
  return (
    <section className="panel full">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Discovery</p>
          <h3>Job pipeline</h3>
        </div>
      </div>
      <div className="table-list">
        {jobQueue.map((job) => (
          <div className="table-row" key={job.title}>
            <span>{job.title}</span>
            <span>{job.company}</span>
            <span>{job.source}</span>
            <strong>{job.score}%</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function Applications() {
  return (
    <section className="panel full">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Tracker</p>
          <h3>Application CRM</h3>
        </div>
      </div>
      <div className="table-list">
        {applications.map((application) => (
          <div className="table-row" key={`${application.company}-${application.role}`}>
            <span>{application.company}</span>
            <span>{application.role}</span>
            <span>{application.status}</span>
            <strong>{application.next}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProfileEditor({ profile, onChange }: { profile: Profile; onChange: (profile: Profile) => void }) {
  const update = (field: keyof Profile, value: string) => onChange({ ...profile, [field]: value });

  return (
    <section className="panel full form-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Profile</p>
          <h3>Master candidate profile</h3>
        </div>
      </div>
      <label>
        Name
        <input value={profile.name} onChange={(event) => update("name", event.target.value)} />
      </label>
      <label>
        Headline
        <input value={profile.headline} onChange={(event) => update("headline", event.target.value)} />
      </label>
      <label>
        Location
        <input value={profile.location} onChange={(event) => update("location", event.target.value)} />
      </label>
      <label>
        Skills
        <textarea value={profile.skills} onChange={(event) => update("skills", event.target.value)} rows={3} />
      </label>
      <label>
        Target roles
        <textarea value={profile.targetRoles} onChange={(event) => update("targetRoles", event.target.value)} rows={3} />
      </label>
    </section>
  );
}

function SettingsPanel({
  provider,
  onProviderChange,
}: {
  provider: string;
  onProviderChange: (provider: string) => void;
}) {
  return (
    <section className="panel full settings-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Settings</p>
          <h3>Automation defaults</h3>
        </div>
      </div>
      <fieldset>
        <legend>AI provider</legend>
        <div className="segmented-control">
          {["ollama", "openrouter", "openai"].map((option) => (
            <button
              key={option}
              className={provider === option ? "selected" : ""}
              type="button"
              onClick={() => onProviderChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="toggle-row">
        <input type="checkbox" defaultChecked />
        <span>Semi-auto review before submit</span>
      </label>
      <label className="toggle-row">
        <input type="checkbox" defaultChecked />
        <span>Store AI responses in local cache</span>
      </label>
      <label className="range-row">
        Daily application limit
        <input type="number" min="1" max="50" defaultValue="12" />
      </label>
    </section>
  );
}

