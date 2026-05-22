import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CheckCheck,
  FileText,
  Play,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import {
  getSidecarStatus,
  getSetting,
  getUserProfile,
  isDesktopRuntime,
  listApplicationEvents,
  listApplications,
  listCommunications,
  listContacts,
  listDocuments,
  listJobs,
  listNotifications,
  listScheduledTasks,
  markNotificationRead,
  runDueScheduledTasks,
  runApplicationReviewDecision,
  runSidecarWorkflow,
  saveApplication,
  saveContact,
  saveScheduledTask,
  saveSetting,
  saveUserProfile,
  updateApplicationWorkflowState,
  type Application,
  type ApplicationEvent,
  type Contact,
  type Communication,
  type Document,
  type Notification as AppNotification,
  type UpsertUserProfile,
  type UserProfile,
} from "./lib/tauri-api";
import {
  applicationEditDraft,
  applicationEditToUpsert,
  type ApplicationEditDraft,
} from "./lib/application-editor";
import {
  contactDraftToUpsert,
  emptyContactDraft,
  isContactDraftSaveable,
  type ContactEditorDraft,
} from "./lib/contact-editor";
import {
  buildApplicationActivity,
  type ApplicationActivity,
  type ApplicationActivitySources,
} from "./lib/application-activity";
import {
  buildApplicationTracker,
  type ApplicationTracker,
  type ApplicationTrackerColumnId,
  type ApplicationTrackerReviewAction,
} from "./lib/application-tracker";
import { runApplicationKanbanMove } from "./lib/application-kanban-control";
import { runApplicationReviewControl } from "./lib/application-review-control";
import {
  buildContactCrm,
  type ContactCrm,
} from "./lib/contact-crm";
import {
  runDiscoveryControl,
  loadJobSummaries,
  type DiscoveryControlDependencies,
  type JobSummary,
} from "./lib/discovery-control";
import {
  defaultDiscoverySettings,
  discoverySettingsFromStoredValues,
  discoverySettingsToStoredValues,
  type DiscoverySettings,
} from "./lib/discovery-settings";
import {
  defaultEmailSettings,
  emailSettingsForProvider,
  emailSettingsFromStoredValues,
  emailSettingsToStoredValues,
  isEmailSettingsConfigured,
  type EmailProvider,
  type EmailSettings,
} from "./lib/email-settings";
import {
  loadRuntimeControlStatus,
  type RuntimeControlDependencies,
  type RuntimeControlStatus,
} from "./lib/runtime-control";
import {
  buildDefaultScheduledTasks,
  loadOrSeedScheduledTasks,
  scheduledTaskSummaries,
  type ScheduledTaskSummary,
} from "./lib/schedule-settings";
import {
  runScheduleControl,
  type ScheduleControlDependencies,
} from "./lib/schedule-control";
import { createScheduleAutoRunner } from "./lib/schedule-auto-runner";
import {
  buildNotificationInbox,
  type NotificationInbox,
} from "./lib/notification-inbox";
import { deliverTauriWorkflowOsNotifications } from "./lib/tauri-notifications";

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
  discovery: DiscoverySettings;
  email: EmailSettings;
};

const routes: Array<{ id: RouteId; label: string; icon: typeof BarChart3 }> = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { id: "applications", label: "Applications", icon: FileText },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "settings", label: "Settings", icon: Settings },
];

const previewJobs: JobSummary[] = [
  {
    title: "Frontend Engineer Intern",
    company: "Northstar Labs",
    score: 91,
    source: "LinkedIn",
    location: "Remote",
    priority: "high",
  },
  {
    title: "Rust Desktop Engineer",
    company: "Helio Systems",
    score: 87,
    source: "Careers",
    location: "Remote",
    priority: "high",
  },
  {
    title: "AI Product Intern",
    company: "SignalWorks",
    score: 79,
    source: "Indeed",
    location: "Bengaluru",
    priority: "medium",
  },
];

const previewApplications: Application[] = [
  applicationRecord({
    id: "preview-applied",
    job_id: "preview-job-applied",
    company_name: "AstraGrid",
    job_title: "React Engineer",
    status: "applied",
    next_follow_up: "2026-05-23T08:00:00Z",
    resume_path: "/preview/astra-resume.pdf",
    cover_letter_path: "/preview/astra-cover.pdf",
    notes: "Follow up if there is no response after the weekend.",
    tags: ["frontend"],
  }),
  applicationRecord({
    id: "preview-preparing",
    job_id: "preview-job-preparing",
    company_name: "Mosaic AI",
    job_title: "Product Intern",
    status: "review_pending",
    submission_url: "https://ats.example/mosaic/review",
    error_message: "Manual review required for required fields: Work authorization",
    notes: "Check work authorization answer before applying.",
    tags: ["ai"],
  }),
  applicationRecord({
    id: "preview-queued",
    job_id: "preview-job-queued",
    company_name: "DeltaStack",
    job_title: "Platform Engineer",
    status: "queued",
  }),
];

const previewContacts: Contact[] = [
  contactRecord({
    id: "preview-recruiter",
    name: "Priya Sharma",
    email: "priya@example.com",
    linkedin_url: "https://linkedin.example/in/priya",
    role: "recruiter",
    notes: "Handles frontend internship hiring",
  }),
  contactRecord({
    id: "preview-manager",
    name: "Arjun Mehta",
    phone: "+91-555-0101",
    role: "hiring_manager",
    notes: "Technical interview owner",
  }),
  contactRecord({
    id: "preview-referral",
    name: "Nisha Rao",
    linkedin_url: "https://linkedin.example/in/nisha",
    role: "referral",
    notes: "Alumni referral",
  }),
];

const previewNotifications: AppNotification[] = [
  notificationRecord({
    id: "preview-response-notification",
    type: "response.received",
    title: "Response received",
    body: "Northstar Labs replied: Interview availability",
    priority: "high",
    metadata: {
      applicationId: "preview-applied",
      responseType: "positive",
    },
    created_at: "2026-05-29T09:30:00Z",
  }),
  notificationRecord({
    id: "preview-submitted-notification",
    type: "application.submitted",
    title: "Application submitted",
    body: "Application submitted to AstraGrid.",
    priority: "medium",
    read_at: "2026-05-29T08:10:00Z",
    created_at: "2026-05-29T08:00:00Z",
  }),
];

const emptyActivitySources: ApplicationActivitySources = {
  events: [],
  documents: [],
  communications: [],
};

const previewActivitySources: Record<string, ApplicationActivitySources> = {
  "preview-applied": {
    events: [
      applicationEventRecord({
        id: "preview-applied-status",
        application_id: "preview-applied",
        event_type: "status_change",
        old_value: "preparing",
        new_value: "applied",
        description: "Application status changed from preparing to applied",
        created_at: "2026-05-21T10:00:00Z",
      }),
      applicationEventRecord({
        id: "preview-applied-document",
        application_id: "preview-applied",
        event_type: "document_generated",
        new_value: "astra-resume.pdf",
        description: "Generated resume document astra-resume.pdf",
        metadata: { document_id: "preview-applied-resume", document_type: "resume" },
        created_at: "2026-05-21T11:00:00Z",
      }),
    ],
    documents: [
      documentRecord({
        id: "preview-applied-resume",
        application_id: "preview-applied",
        type: "resume",
        file_path: "/preview/astra-resume.pdf",
        file_name: "astra-resume.pdf",
        ai_model_used: "ollama",
        created_at: "2026-05-21T11:00:00Z",
      }),
      documentRecord({
        id: "preview-applied-cover",
        application_id: "preview-applied",
        type: "cover_letter",
        file_path: "/preview/astra-cover.pdf",
        file_name: "astra-cover.pdf",
        created_at: "2026-05-21T11:30:00Z",
      }),
    ],
    communications: [
      communicationRecord({
        id: "preview-applied-follow-up",
        application_id: "preview-applied",
        direction: "sent",
        type: "follow_up",
        subject: "Checking in",
        sent_at: "2026-05-21T12:00:00Z",
      }),
    ],
  },
  "preview-preparing": {
    events: [
      applicationEventRecord({
        id: "preview-preparing-status",
        application_id: "preview-preparing",
        event_type: "status_change",
        old_value: "queued",
        new_value: "review_pending",
        description: "Application status changed from queued to review_pending",
        created_at: "2026-05-21T09:00:00Z",
      }),
    ],
    documents: [],
    communications: [],
  },
  "preview-queued": emptyActivitySources,
};

const runtimeDependencies: RuntimeControlDependencies = {
  isDesktopRuntime,
  getSidecarStatus,
  runSidecarWorkflow,
  deliverWorkflowOsNotifications: deliverTauriWorkflowOsNotifications,
};

const discoveryDependencies: DiscoveryControlDependencies = {
  ...runtimeDependencies,
  listJobs,
};

const scheduleDependencies: ScheduleControlDependencies = {
  isDesktopRuntime,
  runDueScheduledTasks,
  listScheduledTasks,
  deliverWorkflowOsNotifications: deliverTauriWorkflowOsNotifications,
};

const schedulePollIntervalMs = 60_000;

const initialRuntimeStatus: RuntimeControlStatus = {
  providerLabel: "Checking",
  runtimeStatus: "Checking",
  statusMessage: "Checking sidecar",
  workflowCount: 0,
};

const previewScheduleTasks = buildDefaultScheduledTasks().map((task) => ({
  id: `preview-${task.type}`,
  created_at: new Date().toISOString(),
  ...task,
}));

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
    discovery: defaultDiscoverySettings,
    email: defaultEmailSettings,
  });
  const [persistedJobs, setPersistedJobs] = useState<JobSummary[]>([]);
  const [persistedApplications, setPersistedApplications] = useState<Application[]>([]);
  const [previewApplicationRecords, setPreviewApplicationRecords] = useState<Application[]>(previewApplications);
  const [persistedContacts, setPersistedContacts] = useState<Contact[]>([]);
  const [contactDraft, setContactDraft] = useState<ContactEditorDraft>(() => emptyContactDraft());
  const [persistedNotifications, setPersistedNotifications] = useState<AppNotification[]>([]);
  const [previewNotificationRecords, setPreviewNotificationRecords] = useState<AppNotification[]>(previewNotifications);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [applicationDraft, setApplicationDraft] = useState<ApplicationEditDraft>(() =>
    applicationEditDraft(previewApplications[0]),
  );
  const [applicationActivity, setApplicationActivity] = useState<ApplicationActivity>(() =>
    buildApplicationActivity(emptyActivitySources),
  );
  const [storageStatus, setStorageStatus] = useState("Ready");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeControlStatus>(initialRuntimeStatus);
  const [workflowStatus, setWorkflowStatus] = useState("Idle");
  const [isRunningDiscovery, setIsRunningDiscovery] = useState(false);
  const [isRunningSchedules, setIsRunningSchedules] = useState(false);
  const [runningReviewActionId, setRunningReviewActionId] = useState<string | null>(null);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [draggedApplicationId, setDraggedApplicationId] = useState<string | null>(null);
  const [isNotificationInboxOpen, setIsNotificationInboxOpen] = useState(false);
  const [scheduleSummaries, setScheduleSummaries] = useState<ScheduledTaskSummary[]>(() =>
    scheduledTaskSummaries(previewScheduleTasks, 8),
  );

  const routeTitle = useMemo(() => routes.find((item) => item.id === route)?.label ?? "Dashboard", [route]);
  const visibleJobs = persistedJobs.length > 0 ? persistedJobs : previewJobs;
  const visibleApplications = persistedApplications.length > 0 ? persistedApplications : previewApplicationRecords;
  const selectedApplicationRecord =
    visibleApplications.find((application) => application.id === selectedApplicationId) ?? null;
  const applicationTracker = useMemo(
    () => buildApplicationTracker(visibleApplications),
    [visibleApplications],
  );
  const contactCrm = useMemo(
    () => buildContactCrm(persistedContacts.length > 0 ? persistedContacts : previewContacts),
    [persistedContacts],
  );
  const visibleNotifications =
    !isDesktopRuntime() && persistedNotifications.length === 0
      ? previewNotificationRecords
      : persistedNotifications;
  const notificationInbox = useMemo(
    () => buildNotificationInbox(visibleNotifications),
    [visibleNotifications],
  );

  useEffect(() => {
    const selectedExists = applicationTracker.rows.some((application) => application.id === selectedApplicationId);
    if (!selectedExists) {
      setSelectedApplicationId(applicationTracker.rows[0]?.id ?? null);
    }
  }, [applicationTracker, selectedApplicationId]);

  useEffect(() => {
    if (selectedApplicationRecord) {
      setApplicationDraft(applicationEditDraft(selectedApplicationRecord));
    }
  }, [selectedApplicationRecord]);

  useEffect(() => {
    let isMounted = true;

    async function refreshRuntimeStatus() {
      const status = await loadRuntimeControlStatus(runtimeDependencies);
      if (isMounted) {
        setRuntimeStatus(status);
      }
    }

    void refreshRuntimeStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isDesktopRuntime()) {
      setStorageStatus("Browser preview");
      return;
    }

    async function loadPersistedState() {
      const [
        storedProfile,
        storedProvider,
        storedReview,
        storedCache,
        storedLimit,
        storedSearchQueries,
        storedFeedSources,
        storedAtsSources,
        storedCareerPageSources,
        storedEmailAccount,
        storedEmailCheck,
        storedScheduledTasks,
        storedJobs,
        storedApplications,
        storedContacts,
        storedNotifications,
      ] = await Promise.all([
        getUserProfile(),
        getSetting("ai.provider"),
        getSetting("application.reviewBeforeSubmit"),
        getSetting("ai.cacheResponses"),
        getSetting("application.maxDailyApplications"),
        getSetting("discovery.searchQueries"),
        getSetting("discovery.feedSources"),
        getSetting("discovery.atsSources"),
        getSetting("discovery.careerPageSources"),
        getSetting("email.account"),
        getSetting("email.check"),
        loadOrSeedScheduledTasks({ listScheduledTasks, saveScheduledTask }),
        listJobs(),
        listApplications(),
        listContacts(),
        listNotifications(),
      ]);

      if (storedProfile) {
        setProfile(profileFromRecord(storedProfile));
      }
      if (storedJobs.length > 0) {
        setPersistedJobs(await loadJobSummaries(() => Promise.resolve(storedJobs)));
      }
      if (storedApplications.length > 0) {
        setPersistedApplications(storedApplications);
      }
      if (storedContacts.length > 0) {
        setPersistedContacts(storedContacts);
      }
      setPersistedNotifications(storedNotifications);
      setScheduleSummaries(scheduledTaskSummaries(storedScheduledTasks, 8));
      setSettings((current) => ({
        ...current,
        provider: typeof storedProvider?.value === "string" ? storedProvider.value : current.provider,
        reviewBeforeSubmit:
          typeof storedReview?.value === "boolean" ? storedReview.value : current.reviewBeforeSubmit,
        cacheResponses: typeof storedCache?.value === "boolean" ? storedCache.value : current.cacheResponses,
        maxDailyApplications:
          typeof storedLimit?.value === "number" ? storedLimit.value : current.maxDailyApplications,
        discovery: discoverySettingsFromStoredValues(
          storedSearchQueries?.value,
          storedFeedSources?.value,
          storedAtsSources?.value,
          storedCareerPageSources?.value,
          current.discovery,
        ),
        email: emailSettingsFromStoredValues(
          storedEmailAccount?.value,
          storedEmailCheck?.value,
          current.email,
        ),
      }));
      setStorageStatus("SQLite ready");
    }

    void loadPersistedState().catch(() => setStorageStatus("Storage unavailable"));
  }, []);

  useEffect(() => {
    if (!selectedApplicationId) {
      setApplicationActivity(buildApplicationActivity(emptyActivitySources));
      return;
    }
    const applicationId = selectedApplicationId;

    const selectedPersistedApplication = persistedApplications.some(
      (application) => application.id === applicationId,
    );
    if (persistedApplications.length > 0 && !selectedPersistedApplication) {
      return;
    }

    if (!isDesktopRuntime() || persistedApplications.length === 0) {
      setApplicationActivity(
        buildApplicationActivity(previewActivitySources[applicationId] ?? emptyActivitySources),
      );
      return;
    }

    let isMounted = true;

    async function loadApplicationActivity() {
      try {
        const [events, documents, communications] = await Promise.all([
          listApplicationEvents(applicationId),
          listDocuments(applicationId),
          listCommunications(applicationId),
        ]);
        if (isMounted) {
          setApplicationActivity(buildApplicationActivity({ events, documents, communications }));
        }
      } catch {
        if (isMounted) {
          setApplicationActivity(buildApplicationActivity(emptyActivitySources));
        }
      }
    }

    void loadApplicationActivity();

    return () => {
      isMounted = false;
    };
  }, [selectedApplicationId, persistedApplications]);

  useEffect(() => {
    const runner = createScheduleAutoRunner(
      {
        isDesktopRuntime,
        runScheduleControl: () => runScheduleControl(scheduleDependencies),
        onResult: (result) => {
          setWorkflowStatus(result.workflowStatus);
          if (result.schedules) {
            setScheduleSummaries(result.schedules);
          }
        },
        onError: () => setWorkflowStatus("scheduled tasks unavailable"),
      },
      { pollIntervalMs: schedulePollIntervalMs },
    );

    runner.start();

    return () => runner.stop();
  }, []);

  async function startDiscovery() {
    setIsRunningDiscovery(true);
    setWorkflowStatus("job-discovery running");
    try {
      const result = await runDiscoveryControl(discoveryDependencies);
      setWorkflowStatus(result.workflowStatus);
      if (result.runtimeStatus) {
        setRuntimeStatus(result.runtimeStatus);
      }
      if (result.jobs) {
        setPersistedJobs(result.jobs);
      }
    } finally {
      setIsRunningDiscovery(false);
    }
  }

  async function startDueScheduledTasks() {
    setIsRunningSchedules(true);
    setWorkflowStatus("scheduled tasks running");
    try {
      const result = await runScheduleControl(scheduleDependencies);
      setWorkflowStatus(result.workflowStatus);
      if (result.schedules) {
        setScheduleSummaries(result.schedules);
      }
    } catch {
      setWorkflowStatus("scheduled tasks unavailable");
    } finally {
      setIsRunningSchedules(false);
    }
  }

  async function saveSelectedApplicationEdits() {
    if (!selectedApplicationRecord) {
      return;
    }

    const editedApplication = applicationEditToUpsert(selectedApplicationRecord, applicationDraft);

    const updatePreviewApplication = () => {
      const updated = {
        ...selectedApplicationRecord,
        notes: editedApplication.notes,
        tags: editedApplication.tags,
      };
      setPreviewApplicationRecords((current) =>
        current.map((application) => (application.id === updated.id ? updated : application)),
      );
      setStorageStatus("Browser preview");
    };

    if (!isDesktopRuntime() || persistedApplications.length === 0) {
      updatePreviewApplication();
      return;
    }

    try {
      const saved = await saveApplication(editedApplication);
      setPersistedApplications((current) =>
        current.map((application) => (application.id === saved.id ? saved : application)),
      );
      setStorageStatus("SQLite ready");
    } catch {
      setStorageStatus("Storage unavailable");
    }
  }

  async function saveRecruiterContact() {
    if (!isContactDraftSaveable(contactDraft)) {
      setStorageStatus("Contact name required");
      return;
    }

    const contact = contactDraftToUpsert(contactDraft);
    if (!isDesktopRuntime()) {
      setPersistedContacts((current) => [
        {
          ...contact,
          id: `preview-contact-${Date.now()}`,
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
      setContactDraft(emptyContactDraft());
      setStorageStatus("Browser preview");
      return;
    }

    setIsSavingContact(true);
    try {
      const saved = await saveContact(contact);
      setPersistedContacts((current) => [saved, ...current]);
      setContactDraft(emptyContactDraft());
      setStorageStatus("SQLite ready");
    } catch {
      setStorageStatus("Storage unavailable");
    } finally {
      setIsSavingContact(false);
    }
  }

  async function handleApplicationReviewAction(action: ApplicationTrackerReviewAction) {
    if (!selectedApplicationRecord) {
      return;
    }

    setRunningReviewActionId(action.id);
    try {
      const result = await runApplicationReviewControl(selectedApplicationRecord, action, {
        isDesktopRuntime: () => isDesktopRuntime() && persistedApplications.length > 0,
        reviewApplication: runApplicationReviewDecision,
      });
      setWorkflowStatus(result.workflowStatus);
      if (!result.application) {
        return;
      }
      const updatedApplication = result.application;

      if (!isDesktopRuntime() || persistedApplications.length === 0) {
        setPreviewApplicationRecords((current) =>
          current.map((application) => (application.id === updatedApplication.id ? updatedApplication : application)),
        );
        setStorageStatus("Browser preview");
        return;
      }

      setPersistedApplications((current) =>
        current.map((application) => (application.id === updatedApplication.id ? updatedApplication : application)),
      );
      setStorageStatus("SQLite ready");
    } finally {
      setRunningReviewActionId(null);
    }
  }

  async function handleApplicationColumnDrop(columnId: ApplicationTrackerColumnId) {
    if (!draggedApplicationId) {
      return;
    }
    const application = visibleApplications.find((item) => item.id === draggedApplicationId);
    if (!application) {
      setDraggedApplicationId(null);
      return;
    }

    try {
      const result = await runApplicationKanbanMove(application, columnId, {
        isDesktopRuntime: () => isDesktopRuntime() && persistedApplications.length > 0,
        updateApplicationWorkflowState,
      });
      setWorkflowStatus(result.workflowStatus);
      if (!result.application) {
        return;
      }
      updateApplicationRecord(result.application);
    } finally {
      setDraggedApplicationId(null);
    }
  }

  async function markInboxNotificationRead(notificationId: string) {
    const readAt = new Date().toISOString();
    if (!isDesktopRuntime()) {
      setPreviewNotificationRecords((current) =>
        current.map((notification) =>
          notification.id === notificationId ? { ...notification, read_at: readAt } : notification,
        ),
      );
      return;
    }

    const updated = await markNotificationRead(notificationId, readAt);
    if (!updated) {
      return;
    }
    setPersistedNotifications((current) =>
      current.map((notification) => (notification.id === updated.id ? updated : notification)),
    );
  }

  function updateApplicationRecord(application: Application) {
    if (!isDesktopRuntime() || persistedApplications.length === 0) {
      setPreviewApplicationRecords((current) =>
        current.map((item) => (item.id === application.id ? application : item)),
      );
      setStorageStatus("Browser preview");
      return;
    }

    setPersistedApplications((current) =>
      current.map((item) => (item.id === application.id ? application : item)),
    );
    setStorageStatus("SQLite ready");
  }

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
            <NotificationInboxButton
              inbox={notificationInbox}
              isOpen={isNotificationInboxOpen}
              onToggle={() => setIsNotificationInboxOpen((current) => !current)}
              onMarkRead={markInboxNotificationRead}
            />
            <button
              className="secondary-action"
              type="button"
              onClick={startDueScheduledTasks}
              disabled={isRunningSchedules}
            >
              <CalendarClock size={17} aria-hidden="true" />
              {isRunningSchedules ? "Running" : "Run Due Tasks"}
            </button>
            <button
              className="primary-action"
              type="button"
              onClick={startDiscovery}
              disabled={isRunningDiscovery}
            >
              <Play size={17} aria-hidden="true" />
              {isRunningDiscovery ? "Running" : "Start Discovery"}
            </button>
          </div>
        </header>

        {route === "dashboard" && (
          <Dashboard
            provider={settings.provider}
            runtimeStatus={runtimeStatus}
            workflowStatus={workflowStatus}
            storageStatus={storageStatus}
            jobs={visibleJobs}
            schedules={scheduleSummaries}
            applicationTracker={applicationTracker}
          />
        )}
        {route === "jobs" && <Jobs jobs={visibleJobs} />}
        {route === "applications" && (
          <Applications
            tracker={applicationTracker}
            activity={applicationActivity}
            contactCrm={contactCrm}
            contactDraft={contactDraft}
            selectedApplicationRecord={selectedApplicationRecord}
            applicationDraft={applicationDraft}
            selectedApplicationId={selectedApplicationId}
            onApplicationDraftChange={setApplicationDraft}
            onContactDraftChange={setContactDraft}
            onSaveContact={saveRecruiterContact}
            onSaveApplicationEdits={saveSelectedApplicationEdits}
            onSelectApplication={setSelectedApplicationId}
            onReviewAction={handleApplicationReviewAction}
            runningReviewActionId={runningReviewActionId}
            isSavingContact={isSavingContact}
            draggedApplicationId={draggedApplicationId}
            onApplicationDragStart={setDraggedApplicationId}
            onApplicationDragEnd={() => setDraggedApplicationId(null)}
            onApplicationDrop={handleApplicationColumnDrop}
          />
        )}
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

function NotificationInboxButton({
  inbox,
  isOpen,
  onToggle,
  onMarkRead,
}: {
  inbox: NotificationInbox;
  isOpen: boolean;
  onToggle: () => void;
  onMarkRead: (notificationId: string) => void;
}) {
  return (
    <div className="notification-menu">
      <button
        className="icon-button notification-trigger"
        type="button"
        aria-label={`${inbox.summary.unread} unread notifications`}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <Bell size={18} aria-hidden="true" />
        {inbox.summary.unread > 0 && <span>{inbox.summary.unread}</span>}
      </button>
      {isOpen && (
        <section className="notification-popover" aria-label="In-app notifications">
          <div className="notification-popover-heading">
            <div>
              <p className="eyebrow">Notifications</p>
              <h3>In-app inbox</h3>
            </div>
            <strong>{inbox.summary.unread}</strong>
          </div>
          <ul className="notification-list">
            {inbox.items.length > 0 ? (
              inbox.items.slice(0, 5).map((notification) => (
                <li className={notification.isUnread ? "unread" : ""} key={notification.id}>
                  <div>
                    <span>{notification.priorityLabel} · {notification.timestampLabel}</span>
                    <strong>{notification.title}</strong>
                    <p>{notification.body}</p>
                  </div>
                  {notification.isUnread && (
                    <button
                      className="icon-button notification-read-button"
                      type="button"
                      aria-label={`Mark ${notification.title} read`}
                      onClick={() => onMarkRead(notification.id)}
                    >
                      <CheckCheck size={16} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))
            ) : (
              <li className="notification-empty">
                <strong>No notifications</strong>
                <span>Workflow alerts will appear here.</span>
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}

function Dashboard({
  provider,
  runtimeStatus,
  workflowStatus,
  storageStatus,
  jobs,
  schedules,
  applicationTracker,
}: {
  provider: string;
  runtimeStatus: RuntimeControlStatus;
  workflowStatus: string;
  storageStatus: string;
  jobs: JobSummary[];
  schedules: ScheduledTaskSummary[];
  applicationTracker: ApplicationTracker;
}) {
  const metrics = [
    { label: "Matched Jobs", value: String(jobs.length), tone: "green" },
    { label: "Queued Applications", value: String(applicationTracker.metrics.queued), tone: "blue" },
    { label: "Follow-ups Due", value: String(applicationTracker.metrics.followUpsDue), tone: "amber" },
    { label: "Active Applications", value: String(applicationTracker.metrics.active), tone: "violet" },
  ];

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
          {jobs.slice(0, 3).map((job) => (
            <article className="job-row" key={`${job.company}-${job.title}`}>
              <div>
                <strong>{job.title}</strong>
                <span>{job.company} · {job.source}</span>
              </div>
              <b>{job.score ?? "-"}</b>
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
            <dd>
              {runtimeStatus.providerLabel === "Checking" ? provider : runtimeStatus.providerLabel}
            </dd>
          </div>
          <div>
            <dt>Sidecar</dt>
            <dd>{runtimeStatus.statusMessage}</dd>
          </div>
          <div>
            <dt>Workflow</dt>
            <dd>{workflowStatus}</dd>
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
          {schedules.length > 0 ? (
            schedules.map((schedule) => (
              <li key={schedule.id}>
                <span>{schedule.nextRunLabel}</span>
                {schedule.name}
              </li>
            ))
          ) : (
            <li>
              <span>-</span>
              No scheduled tasks
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Jobs({ jobs }: { jobs: JobSummary[] }) {
  return (
    <section className="panel full">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Discovery</p>
          <h3>Job pipeline</h3>
        </div>
      </div>
      <div className="table-list">
        {jobs.map((job) => (
          <div className="table-row" key={`${job.source}-${job.company}-${job.title}`}>
            <span>{job.title}</span>
            <span>{job.company}</span>
            <span>{job.location} · {job.source}</span>
            <strong>{job.score === null ? job.priority : `${job.score}%`}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function Applications({
  tracker,
  activity,
  contactCrm,
  contactDraft,
  selectedApplicationRecord,
  applicationDraft,
  selectedApplicationId,
  onApplicationDraftChange,
  onContactDraftChange,
  onSaveContact,
  onSaveApplicationEdits,
  onSelectApplication,
  onReviewAction,
  runningReviewActionId,
  isSavingContact,
  draggedApplicationId,
  onApplicationDragStart,
  onApplicationDragEnd,
  onApplicationDrop,
}: {
  tracker: ApplicationTracker;
  activity: ApplicationActivity;
  contactCrm: ContactCrm;
  contactDraft: ContactEditorDraft;
  selectedApplicationRecord: Application | null;
  applicationDraft: ApplicationEditDraft;
  selectedApplicationId: string | null;
  onApplicationDraftChange: (draft: ApplicationEditDraft) => void;
  onContactDraftChange: (draft: ContactEditorDraft) => void;
  onSaveContact: () => void;
  onSaveApplicationEdits: () => void;
  onSelectApplication: (applicationId: string) => void;
  onReviewAction: (action: ApplicationTrackerReviewAction) => void;
  runningReviewActionId: string | null;
  isSavingContact: boolean;
  draggedApplicationId: string | null;
  onApplicationDragStart: (applicationId: string) => void;
  onApplicationDragEnd: () => void;
  onApplicationDrop: (columnId: ApplicationTrackerColumnId) => void;
}) {
  const selectedApplication = tracker.rows.find((application) => application.id === selectedApplicationId);
  const updateDraft = <Key extends keyof ApplicationEditDraft>(key: Key, value: ApplicationEditDraft[Key]) =>
    onApplicationDraftChange({ ...applicationDraft, [key]: value });
  const updateContactDraft = <Key extends keyof ContactEditorDraft>(key: Key, value: ContactEditorDraft[Key]) =>
    onContactDraftChange({ ...contactDraft, [key]: value });

  return (
    <section className="panel full">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Tracker</p>
          <h3>Application CRM</h3>
        </div>
      </div>
      <div className="tracker-summary" aria-label="Application tracker summary">
        <span>
          Total <strong>{tracker.metrics.total}</strong>
        </span>
        <span>
          Active <strong>{tracker.metrics.active}</strong>
        </span>
        <span>
          Follow-ups due <strong>{tracker.metrics.followUpsDue}</strong>
        </span>
      </div>
      <div className="tracker-lanes" aria-label="Application status columns">
        {tracker.columns.map((column) => (
          <section
            className={draggedApplicationId ? "tracker-lane kanban-drop-target" : "tracker-lane"}
            data-kanban-column={column.id}
            key={column.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => onApplicationDrop(column.id)}
          >
            <div className="tracker-lane-heading">
              <span>{column.label}</span>
              <strong>{column.count}</strong>
            </div>
            <ul>
              {column.rows.slice(0, 2).map((application) => (
                <li key={application.id}>{application.company}</li>
              ))}
              {column.rows.length === 0 && <li className="empty-lane">No applications</li>}
            </ul>
          </section>
        ))}
      </div>
      <div className="table-list">
        {tracker.rows.map((application) => (
          <button
            className={
              application.id === selectedApplicationId
                ? "table-row application-row selected"
                : "table-row application-row"
            }
            key={application.id}
            type="button"
            data-application-id={application.id}
            draggable
            aria-grabbed={draggedApplicationId === application.id}
            onDragStart={() => onApplicationDragStart(application.id)}
            onDragEnd={onApplicationDragEnd}
            onClick={() => onSelectApplication(application.id)}
          >
            <span>{application.company}</span>
            <span>{application.role}</span>
            <span>{application.statusLabel} · {application.documentLabel}</span>
            <strong>{application.nextAction}</strong>
          </button>
        ))}
      </div>
      {selectedApplication && selectedApplication.reviewActions.length > 0 && (
        <section className="review-actions" aria-label="Application review actions">
          <div>
            <p className="eyebrow">Review</p>
            <h4>{selectedApplication.company}</h4>
          </div>
          <div className="review-action-group">
            {selectedApplication.reviewActions.map((action) => {
              const isRunning = runningReviewActionId === action.id;
              const Icon = action.id === "approve_review" ? CheckCircle2 : XCircle;
              return (
                <button
                  className={action.id === "approve_review" ? "primary-action" : "secondary-action"}
                  key={action.id}
                  type="button"
                  onClick={() => onReviewAction(action)}
                  disabled={runningReviewActionId !== null}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{isRunning ? "Saving" : action.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <section className="contact-crm" aria-label="Recruiter contact CRM">
        <div className="activity-heading">
          <div>
            <p className="eyebrow">Contacts</p>
            <h4>Recruiter CRM</h4>
          </div>
          <strong>{contactCrm.summary.reachable}/{contactCrm.summary.total}</strong>
        </div>
        <div className="contact-metrics">
          <span>
            Recruiters <strong>{contactCrm.summary.recruiters}</strong>
          </span>
          <span>
            Hiring managers <strong>{contactCrm.summary.hiringManagers}</strong>
          </span>
          <span>
            Referrals <strong>{contactCrm.summary.referrals}</strong>
          </span>
        </div>
        <div className="contact-grid">
          {contactCrm.rows.length > 0 ? (
            contactCrm.rows.slice(0, 4).map((contact) => (
              <article className="contact-card" key={contact.id}>
                <div>
                  <strong>{contact.name}</strong>
                  <span>{contact.roleLabel} · {contact.primaryChannel}</span>
                </div>
                <p>{contact.contactDetail}</p>
                {contact.notes && <small>{contact.notes}</small>}
              </article>
            ))
          ) : (
            <article className="contact-card empty-contact">
              <div>
                <strong>No contacts yet</strong>
                <span>Add recruiters and referrals</span>
              </div>
            </article>
          )}
        </div>
        <form
          className="contact-editor"
          aria-label="Contact editor"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveContact();
          }}
        >
          <div className="contact-editor-grid">
            <label>
              Name
              <input
                value={contactDraft.name}
                onChange={(event) => updateContactDraft("name", event.target.value)}
              />
            </label>
            <label>
              Role
              <select
                value={contactDraft.role}
                onChange={(event) => updateContactDraft("role", event.target.value)}
              >
                <option value="recruiter">Recruiter</option>
                <option value="hiring_manager">Hiring manager</option>
                <option value="referral">Referral</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Email
              <input
                type="email"
                value={contactDraft.email}
                onChange={(event) => updateContactDraft("email", event.target.value)}
              />
            </label>
            <label>
              Phone
              <input
                value={contactDraft.phone}
                onChange={(event) => updateContactDraft("phone", event.target.value)}
              />
            </label>
            <label>
              LinkedIn
              <input
                type="url"
                value={contactDraft.linkedinUrl}
                onChange={(event) => updateContactDraft("linkedinUrl", event.target.value)}
              />
            </label>
            <label>
              Notes
              <input
                value={contactDraft.notes}
                onChange={(event) => updateContactDraft("notes", event.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="secondary-action"
              type="submit"
              disabled={!isContactDraftSaveable(contactDraft) || isSavingContact}
            >
              <Plus size={16} aria-hidden="true" />
              <span>{isSavingContact ? "Saving" : "Save Contact"}</span>
            </button>
          </div>
        </form>
      </section>
      <section className="application-editor" aria-label="Application notes and tags">
        <div className="activity-heading">
          <div>
            <p className="eyebrow">Notes</p>
            <h4>{selectedApplicationRecord ? `${selectedApplicationRecord.company_name} details` : "Application details"}</h4>
          </div>
          <button
            className="secondary-action"
            type="button"
            onClick={onSaveApplicationEdits}
            disabled={!selectedApplicationRecord}
          >
            Save Notes
          </button>
        </div>
        <div className="application-editor-grid">
          <label>
            Notes
            <textarea
              value={applicationDraft.notes}
              onChange={(event) => updateDraft("notes", event.target.value)}
              rows={4}
            />
          </label>
          <label>
            Tags
            <input
              value={applicationDraft.tagsText}
              onChange={(event) => updateDraft("tagsText", event.target.value)}
            />
          </label>
        </div>
      </section>
      <div className="activity-detail">
        <section className="activity-section" aria-label="Application activity timeline">
          <div className="activity-heading">
            <div>
              <p className="eyebrow">Activity</p>
              <h4>{selectedApplication ? selectedApplication.company : "Timeline"}</h4>
            </div>
            <strong>{activity.summary.timelineCount}</strong>
          </div>
          <ul className="activity-list">
            {activity.timeline.length > 0 ? (
              activity.timeline.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <time>{item.timestampLabel}</time>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                </li>
              ))
            ) : (
              <li className="activity-empty">
                <time>-</time>
                <div>
                  <strong>No activity yet</strong>
                  <span>Waiting for workflow events</span>
                </div>
              </li>
            )}
          </ul>
        </section>
        <div className="activity-stack">
          <section className="activity-section" aria-label="Application document history">
            <div className="activity-heading compact">
              <h4>Document history</h4>
              <strong>{activity.summary.documentCount}</strong>
            </div>
            <ul className="compact-activity-list">
              {activity.documents.length > 0 ? (
                activity.documents.slice(0, 4).map((document) => (
                  <li key={document.id}>
                    <strong>{document.label}</strong>
                    <span>{document.detail}</span>
                  </li>
                ))
              ) : (
                <li className="activity-empty">No documents</li>
              )}
            </ul>
          </section>
          <section className="activity-section" aria-label="Application communication log">
            <div className="activity-heading compact">
              <h4>Communication log</h4>
              <strong>{activity.summary.communicationCount}</strong>
            </div>
            <ul className="compact-activity-list">
              {activity.communications.length > 0 ? (
                activity.communications.slice(0, 4).map((communication) => (
                  <li key={communication.id}>
                    <strong>{communication.label}</strong>
                    <span>{communication.detail}</span>
                  </li>
                ))
              ) : (
                <li className="activity-empty">No communications</li>
              )}
            </ul>
          </section>
        </div>
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
  const updateDiscovery = <Key extends keyof DiscoverySettings>(key: Key, value: DiscoverySettings[Key]) =>
    onSettingsChange({
      ...settings,
      discovery: { ...settings.discovery, [key]: value },
    });
  const updateEmail = <Key extends keyof EmailSettings>(key: Key, value: EmailSettings[Key]) =>
    onSettingsChange({
      ...settings,
      email: { ...settings.email, [key]: value },
    });
  const updateEmailProvider = (provider: EmailProvider) =>
    onSettingsChange({
      ...settings,
      email: emailSettingsForProvider(settings.email, provider),
    });

  async function persistSettings() {
    if (!isDesktopRuntime()) {
      onStatusChange("Browser preview");
      return;
    }

    const discoveryValues = discoverySettingsToStoredValues(settings.discovery);
    const emailValues = emailSettingsToStoredValues(settings.email);
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
        saveSetting({
          key: "discovery.searchQueries",
          value: discoveryValues.searchQueries,
          category: "discovery",
        }),
        saveSetting({
          key: "discovery.feedSources",
          value: discoveryValues.feedSources,
          category: "discovery",
        }),
        saveSetting({
          key: "discovery.atsSources",
          value: discoveryValues.atsSources,
          category: "discovery",
        }),
        saveSetting({
          key: "discovery.careerPageSources",
          value: discoveryValues.careerPageSources,
          category: "discovery",
        }),
        saveSetting({
          key: "email.account",
          value: emailValues.account,
          category: "email",
        }),
        saveSetting({
          key: "email.check",
          value: emailValues.check,
          category: "email",
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
      <fieldset className="settings-section">
        <legend>Job discovery</legend>
        <div className="settings-grid">
          <label>
            Search keywords
            <input
              value={settings.discovery.searchKeywords}
              onChange={(event) => updateDiscovery("searchKeywords", event.target.value)}
            />
          </label>
          <label>
            Location
            <input
              value={settings.discovery.searchLocation}
              onChange={(event) => updateDiscovery("searchLocation", event.target.value)}
            />
          </label>
          <label className="toggle-row settings-toggle">
            <input
              type="checkbox"
              checked={settings.discovery.remoteOnly}
              onChange={(event) => updateDiscovery("remoteOnly", event.target.checked)}
            />
            <span>Remote jobs only</span>
          </label>
        </div>
      </fieldset>
      <fieldset className="settings-section">
        <legend>JSON feed source</legend>
        <div className="settings-grid">
          <label>
            Feed URL
            <input
              type="url"
              value={settings.discovery.feedSourceUrl}
              onChange={(event) => updateDiscovery("feedSourceUrl", event.target.value)}
            />
          </label>
          <label>
            Platform
            <input
              value={settings.discovery.feedSourcePlatform}
              onChange={(event) => updateDiscovery("feedSourcePlatform", event.target.value)}
            />
          </label>
          <label>
            Feed name
            <input
              value={settings.discovery.feedSourceName}
              onChange={(event) => updateDiscovery("feedSourceName", event.target.value)}
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="settings-section">
        <legend>ATS sources</legend>
        <div className="settings-grid">
          <label>
            Greenhouse board token
            <input
              value={settings.discovery.greenhouseBoardToken}
              onChange={(event) => updateDiscovery("greenhouseBoardToken", event.target.value)}
            />
          </label>
          <label>
            Lever company
            <input
              value={settings.discovery.leverCompany}
              onChange={(event) => updateDiscovery("leverCompany", event.target.value)}
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="settings-section">
        <legend>Company career page</legend>
        <div className="settings-grid">
          <label>
            Career page URL
            <input
              type="url"
              value={settings.discovery.careerPageUrl}
              onChange={(event) => updateDiscovery("careerPageUrl", event.target.value)}
            />
          </label>
          <label>
            Company name
            <input
              value={settings.discovery.careerPageCompany}
              onChange={(event) => updateDiscovery("careerPageCompany", event.target.value)}
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="settings-section">
        <legend>Email account</legend>
        <div className="segmented-control">
          {(["gmail", "outlook", "custom"] as EmailProvider[]).map((option) => (
            <button
              key={option}
              className={settings.email.provider === option ? "selected" : ""}
              type="button"
              onClick={() => updateEmailProvider(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="settings-grid">
          <label>
            From name
            <input
              value={settings.email.fromName}
              onChange={(event) => updateEmail("fromName", event.target.value)}
            />
          </label>
          <label>
            From email
            <input
              type="email"
              value={settings.email.fromEmail}
              onChange={(event) => updateEmail("fromEmail", event.target.value)}
            />
          </label>
          <label>
            Login username
            <input
              value={settings.email.username}
              onChange={(event) => updateEmail("username", event.target.value)}
            />
          </label>
          <label>
            App password
            <input
              type="password"
              value={settings.email.appPassword}
              onChange={(event) => updateEmail("appPassword", event.target.value)}
            />
          </label>
          <label>
            Mailbox
            <input
              value={settings.email.mailbox}
              onChange={(event) => updateEmail("mailbox", event.target.value)}
            />
          </label>
          <label>
            Max responses
            <input
              type="number"
              min="1"
              max="100"
              value={settings.email.maxResponses}
              onChange={(event) => updateEmail("maxResponses", Number(event.target.value))}
            />
          </label>
        </div>
        <div className="settings-grid">
          <label>
            SMTP host
            <input
              value={settings.email.smtpHost}
              onChange={(event) => updateEmail("smtpHost", event.target.value)}
            />
          </label>
          <label>
            SMTP port
            <input
              type="number"
              min="1"
              value={settings.email.smtpPort}
              onChange={(event) => updateEmail("smtpPort", Number(event.target.value))}
            />
          </label>
          <label className="toggle-row settings-toggle">
            <input
              type="checkbox"
              checked={settings.email.smtpSecure}
              onChange={(event) => updateEmail("smtpSecure", event.target.checked)}
            />
            <span>SMTP secure</span>
          </label>
          <label>
            IMAP host
            <input
              value={settings.email.imapHost}
              onChange={(event) => updateEmail("imapHost", event.target.value)}
            />
          </label>
          <label>
            IMAP port
            <input
              type="number"
              min="1"
              value={settings.email.imapPort}
              onChange={(event) => updateEmail("imapPort", Number(event.target.value))}
            />
          </label>
          <label className="toggle-row settings-toggle">
            <input
              type="checkbox"
              checked={settings.email.imapSecure}
              onChange={(event) => updateEmail("imapSecure", event.target.checked)}
            />
            <span>IMAP secure</span>
          </label>
        </div>
        <label>
          Signature
          <textarea
            value={settings.email.signature}
            onChange={(event) => updateEmail("signature", event.target.value)}
            rows={3}
          />
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.email.markSeen}
            onChange={(event) => updateEmail("markSeen", event.target.checked)}
          />
          <span>Mark checked messages as read</span>
        </label>
        <p className="settings-status">
          {isEmailSettingsConfigured(settings.email) ? "Email workflows enabled" : "Email workflows need account details"}
        </p>
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

function applicationRecord(overrides: Partial<Application>): Application {
  return {
    id: "preview-application",
    job_id: "preview-job",
    job_title: "Application",
    company_name: "Company",
    status: "queued",
    mode: "semi-auto",
    resume_path: null,
    cover_letter_path: null,
    last_follow_up: null,
    follow_up_count: 0,
    next_follow_up: null,
    response_date: null,
    response_type: null,
    response_notes: null,
    submitted_at: null,
    submission_url: null,
    confirmation_id: null,
    error_message: null,
    retry_count: 0,
    max_retries: 3,
    notes: null,
    tags: [],
    ...overrides,
  };
}

function applicationEventRecord(overrides: Partial<ApplicationEvent>): ApplicationEvent {
  return {
    id: "preview-event",
    application_id: "preview-application",
    event_type: "status_change",
    old_value: null,
    new_value: null,
    description: null,
    metadata: {},
    created_at: "2026-05-21T10:00:00Z",
    ...overrides,
  };
}

function documentRecord(overrides: Partial<Document>): Document {
  return {
    id: "preview-document",
    application_id: "preview-application",
    type: "resume",
    file_path: "/preview/resume.pdf",
    file_name: "resume.pdf",
    version: 1,
    ai_model_used: null,
    created_at: "2026-05-21T10:00:00Z",
    ...overrides,
  };
}

function communicationRecord(overrides: Partial<Communication>): Communication {
  return {
    id: "preview-communication",
    application_id: "preview-application",
    contact_id: null,
    direction: "sent",
    type: "follow_up",
    subject: null,
    body: null,
    email_id: null,
    sent_at: null,
    read_at: null,
    created_at: "2026-05-21T10:00:00Z",
    ...overrides,
  };
}

function contactRecord(overrides: Partial<Contact>): Contact {
  return {
    id: "preview-contact",
    company_id: null,
    name: "Contact",
    email: null,
    phone: null,
    linkedin_url: null,
    role: null,
    notes: null,
    created_at: "2026-05-21T10:00:00Z",
    ...overrides,
  };
}

function notificationRecord(overrides: Partial<AppNotification>): AppNotification {
  return {
    id: "preview-notification",
    type: "application.submitted",
    title: "Application submitted",
    body: "Application submitted.",
    priority: "medium",
    channel: "in_app",
    metadata: {},
    read_at: null,
    created_at: "2026-05-29T09:00:00Z",
    ...overrides,
  };
}
