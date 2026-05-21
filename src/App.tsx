import { useEffect, useMemo, useState } from "react";
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
import {
  getSetting,
  getUserProfile,
  isDesktopRuntime,
  saveSetting,
  saveUserProfile,
  type UpsertUserProfile,
  type UserProfile,
} from "./lib/tauri-api";

type RouteId = "dashboard" | "jobs" | "applications" | "profile" | "settings";

type Profile = {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  skills: string;
  targetRoles: string;
};

type AutomationSettings = {
  provider: string;
  reviewBeforeSubmit: boolean;
  cacheResponses: boolean;
  maxDailyApplications: number;
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
    fullName: "Deepak Kudi",
    headline: "React and TypeScript engineer",
    email: "",
    phone: "",
    location: "India",
    summary: "Builds local-first desktop tools.",
    skills: "React, TypeScript, Rust, Node.js",
    targetRoles: "Frontend Engineer, AI Product Intern, Desktop App Engineer",
  });
  const [settings, setSettings] = useState<AutomationSettings>({
    provider: "ollama",
    reviewBeforeSubmit: true,
    cacheResponses: true,
    maxDailyApplications: 12,
  });
  const [storageStatus, setStorageStatus] = useState("Ready");

  const routeTitle = useMemo(() => routes.find((item) => item.id === route)?.label ?? "Dashboard", [route]);

  useEffect(() => {
    if (!isDesktopRuntime()) {
      setStorageStatus("Browser preview");
      return;
    }

    async function loadPersistedState() {
      const [storedProfile, storedProvider, storedReview, storedCache, storedLimit] = await Promise.all([
        getUserProfile(),
        getSetting("ai.provider"),
        getSetting("application.reviewBeforeSubmit"),
        getSetting("ai.cacheResponses"),
        getSetting("application.maxDailyApplications"),
      ]);

      if (storedProfile) {
        setProfile(profileFromRecord(storedProfile));
      }
      setSettings((current) => ({
        provider: typeof storedProvider?.value === "string" ? storedProvider.value : current.provider,
        reviewBeforeSubmit:
          typeof storedReview?.value === "boolean" ? storedReview.value : current.reviewBeforeSubmit,
        cacheResponses: typeof storedCache?.value === "boolean" ? storedCache.value : current.cacheResponses,
        maxDailyApplications:
          typeof storedLimit?.value === "number" ? storedLimit.value : current.maxDailyApplications,
      }));
      setStorageStatus("SQLite ready");
    }

    void loadPersistedState().catch(() => setStorageStatus("Storage unavailable"));
  }, []);

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

        {route === "dashboard" && <Dashboard provider={settings.provider} storageStatus={storageStatus} />}
        {route === "jobs" && <Jobs />}
        {route === "applications" && <Applications />}
        {route === "profile" && (
          <ProfileEditor profile={profile} onChange={setProfile} onStatusChange={setStorageStatus} />
        )}
        {route === "settings" && (
          <SettingsPanel settings={settings} onSettingsChange={setSettings} onStatusChange={setStorageStatus} />
        )}
      </section>
    </main>
  );
}

function Dashboard({ provider, storageStatus }: { provider: string; storageStatus: string }) {
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
            <dd>{storageStatus}</dd>
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

function ProfileEditor({
  profile,
  onChange,
  onStatusChange,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onStatusChange: (status: string) => void;
}) {
  const update = (field: keyof Profile, value: string) => onChange({ ...profile, [field]: value });
  const [isSaving, setIsSaving] = useState(false);

  async function persistProfile() {
    if (!isDesktopRuntime()) {
      onStatusChange("Browser preview");
      return;
    }

    setIsSaving(true);
    try {
      await saveUserProfile(profileToRecord(profile));
      onStatusChange("SQLite ready");
    } catch {
      onStatusChange("Storage unavailable");
    } finally {
      setIsSaving(false);
    }
  }

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
        <input value={profile.fullName} onChange={(event) => update("fullName", event.target.value)} />
      </label>
      <label>
        Email
        <input value={profile.email} onChange={(event) => update("email", event.target.value)} />
      </label>
      <label>
        Phone
        <input value={profile.phone} onChange={(event) => update("phone", event.target.value)} />
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
        Summary
        <textarea value={profile.summary} onChange={(event) => update("summary", event.target.value)} rows={4} />
      </label>
      <label>
        Skills
        <textarea value={profile.skills} onChange={(event) => update("skills", event.target.value)} rows={3} />
      </label>
      <label>
        Target roles
        <textarea value={profile.targetRoles} onChange={(event) => update("targetRoles", event.target.value)} rows={3} />
      </label>
      <div className="form-actions">
        <button className="primary-action" type="button" onClick={persistProfile} disabled={isSaving}>
          {isSaving ? "Saving" : "Save Profile"}
        </button>
      </div>
    </section>
  );
}

function SettingsPanel({
  settings,
  onSettingsChange,
  onStatusChange,
}: {
  settings: AutomationSettings;
  onSettingsChange: (settings: AutomationSettings) => void;
  onStatusChange: (status: string) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const update = <Key extends keyof AutomationSettings>(key: Key, value: AutomationSettings[Key]) =>
    onSettingsChange({ ...settings, [key]: value });

  async function persistSettings() {
    if (!isDesktopRuntime()) {
      onStatusChange("Browser preview");
      return;
    }

    setIsSaving(true);
    try {
      await Promise.all([
        saveSetting({ key: "ai.provider", value: settings.provider, category: "ai" }),
        saveSetting({ key: "application.reviewBeforeSubmit", value: settings.reviewBeforeSubmit, category: "application" }),
        saveSetting({ key: "ai.cacheResponses", value: settings.cacheResponses, category: "ai" }),
        saveSetting({
          key: "application.maxDailyApplications",
          value: settings.maxDailyApplications,
          category: "application",
        }),
      ]);
      onStatusChange("SQLite ready");
    } catch {
      onStatusChange("Storage unavailable");
    } finally {
      setIsSaving(false);
    }
  }

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
              className={settings.provider === option ? "selected" : ""}
              type="button"
              onClick={() => update("provider", option)}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings.reviewBeforeSubmit}
          onChange={(event) => update("reviewBeforeSubmit", event.target.checked)}
        />
        <span>Semi-auto review before submit</span>
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings.cacheResponses}
          onChange={(event) => update("cacheResponses", event.target.checked)}
        />
        <span>Store AI responses in local cache</span>
      </label>
      <label className="range-row">
        Daily application limit
        <input
          type="number"
          min="1"
          max="50"
          value={settings.maxDailyApplications}
          onChange={(event) => update("maxDailyApplications", Number(event.target.value))}
        />
      </label>
      <div className="form-actions">
        <button className="primary-action" type="button" onClick={persistSettings} disabled={isSaving}>
          {isSaving ? "Saving" : "Save Settings"}
        </button>
      </div>
    </section>
  );
}

function profileToRecord(profile: Profile): UpsertUserProfile {
  return {
    full_name: profile.fullName,
    headline: profile.headline,
    email: nullableText(profile.email),
    phone: nullableText(profile.phone),
    location: nullableText(profile.location),
    portfolio_url: null,
    linkedin_url: null,
    github_url: null,
    summary: nullableText(profile.summary),
    skills: splitList(profile.skills),
    target_roles: splitList(profile.targetRoles),
    preferences: {
      remotePreference: "any",
    },
  };
}

function profileFromRecord(profile: UserProfile): Profile {
  return {
    fullName: profile.full_name,
    headline: profile.headline,
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    location: profile.location ?? "",
    summary: profile.summary ?? "",
    skills: profile.skills.join(", "),
    targetRoles: profile.target_roles.join(", "),
  };
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
