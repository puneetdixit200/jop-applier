import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CheckCheck,
  FileText,
  Send,
  Play,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import { Button } from "./components/ui/button";
import {
  configureDatabaseEncryption,
  getDatabaseEncryptionStatus,
  getSidecarStatus,
  getSetting,
  getUserProfile,
  isDesktopRuntime,
  listApplicationEvents,
  listApplications,
  listCommunications,
  listContacts,
  listDocuments,
  listFundedCompanies,
  listJobs,
  listNotifications,
  listOutreachEmails,
  listProspectContacts,
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
  updateOutreachEmailReview,
  updateApplicationWorkflowState,
  type Application,
  type ApplicationEvent,
  type Contact,
  type Communication,
  type DatabaseEncryptionStatus,
  type Document,
  type FundedCompany,
  type Notification as AppNotification,
  type OutreachEmail,
  type ProspectContact,
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
import {
  applyOutreachReviewDecision,
  buildOutreachAnalytics,
  buildOutreachCompanyAnalytics,
  buildOutreachDailyVolume,
  buildOutreachReviewPanel,
  buildOutreachReviewQueue,
  buildProspectingCompanyDetail,
  buildProspectingDashboard,
  type OutreachCompanyAnalyticsRow,
  type OutreachDailyVolumeRow,
  type OutreachReviewDecision,
  type OutreachReviewPanel,
  type OutreachAnalyticsSummary,
  type OutreachReviewQueueItem,
  type ProspectingCompanyDetail,
  type ProspectingDashboard,
} from "./lib/prospecting-dashboard";
import { deliverTauriWorkflowOsNotifications } from "./lib/tauri-notifications";
import {
  buildOnboardingStatus,
  type OnboardingStatus,
  type OnboardingStep,
} from "./lib/onboarding";
import { useAppStore, type RouteId } from "./stores/app-store";

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

type OutreachReviewDraft = {
  subject: string;
  bodyText: string;
};

type OutreachReviewRunningAction = OutreachReviewDecision | "save" | null;

const routes: Array<{ id: RouteId; label: string; icon: typeof BarChart3 }> = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { id: "prospecting", label: "Prospecting", icon: Bot },
  { id: "outreach", label: "Outreach", icon: Send },
  { id: "applications", label: "Applications", icon: FileText },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
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

const previewFundedCompanies: FundedCompany[] = [
  fundedCompanyRecord({
    id: "preview-setu",
    name: "Setu by Pine Labs",
    domain: "setu.co",
    funding_stage: "series_a",
    funding_amount: 30_000_000,
    investors: ["Bharat Inclusion Fund"],
    lead_investor: "Bharat Inclusion Fund",
    relevance_score: 91,
    status: "review",
    ai_summary: "Fintech API platform with strong backend fit.",
  }),
  fundedCompanyRecord({
    id: "preview-zolve",
    name: "Zolve",
    domain: "zolve.com",
    funding_stage: "series_b",
    funding_amount: 100_000_000,
    investors: ["Accel"],
    lead_investor: "Accel",
    relevance_score: 82,
    status: "queued",
    ai_summary: "Global fintech hiring across product and platform teams.",
  }),
  fundedCompanyRecord({
    id: "preview-groww",
    name: "Groww",
    domain: "groww.in",
    funding_stage: "series_e",
    funding_amount: 250_000_000,
    investors: ["Tiger Global"],
    lead_investor: "Tiger Global",
    relevance_score: 74,
    status: "draft",
  }),
];

const previewProspectContacts: ProspectContact[] = [
  prospectContactRecord({
    id: "preview-setu-priya",
    company_id: "preview-setu",
    full_name: "Priya Sharma",
    email: "priya@setu.co",
    email_confidence: 0.91,
    role: "hr_manager",
  }),
  prospectContactRecord({
    id: "preview-setu-aman",
    company_id: "preview-setu",
    full_name: "Aman Founder",
    email: "aman@setu.co",
    email_confidence: 0.82,
    role: "founder",
  }),
  prospectContactRecord({
    id: "preview-zolve-divya",
    company_id: "preview-zolve",
    full_name: "Divya Mehta",
    email: "divya@zolve.com",
    email_confidence: 0.8,
    role: "recruiter",
  }),
];

const previewOutreachEmails: OutreachEmail[] = [
  outreachEmailRecord({
    id: "preview-review-setu",
    campaign_id: "preview-campaign-setu",
    contact_id: "preview-setu-priya",
    status: "pending",
    scheduled_at: "2026-05-23T04:30:00.000Z",
  }),
  outreachEmailRecord({
    id: "preview-sent-zolve",
    campaign_id: "preview-campaign-zolve",
    contact_id: "preview-zolve-divya",
    status: "sent",
    sent_at: "2026-05-22T04:30:00.000Z",
  }),
  outreachEmailRecord({
    id: "preview-replied-setu",
    campaign_id: "preview-campaign-setu",
    contact_id: "preview-setu-aman",
    status: "replied",
    sent_at: "2026-05-21T04:30:00.000Z",
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
  const route = useAppStore((state) => state.route);
  const setRoute = useAppStore((state) => state.setRoute);
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
  const [persistedFundedCompanies, setPersistedFundedCompanies] = useState<FundedCompany[]>([]);
  const [persistedProspectContacts, setPersistedProspectContacts] = useState<ProspectContact[]>([]);
  const [persistedOutreachEmails, setPersistedOutreachEmails] = useState<OutreachEmail[]>([]);
  const [previewOutreachEmailRecords, setPreviewOutreachEmailRecords] = useState<OutreachEmail[]>(previewOutreachEmails);
  const [contactDraft, setContactDraft] = useState<ContactEditorDraft>(() => emptyContactDraft());
  const [persistedNotifications, setPersistedNotifications] = useState<AppNotification[]>([]);
  const [previewNotificationRecords, setPreviewNotificationRecords] = useState<AppNotification[]>(previewNotifications);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [selectedProspectingCompanyId, setSelectedProspectingCompanyId] = useState<string | null>(null);
  const [selectedOutreachEmailId, setSelectedOutreachEmailId] = useState<string | null>(null);
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
  const [runningOutreachReviewAction, setRunningOutreachReviewAction] =
    useState<OutreachReviewRunningAction>(null);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [draggedApplicationId, setDraggedApplicationId] = useState<string | null>(null);
  const [isNotificationInboxOpen, setIsNotificationInboxOpen] = useState(false);
  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState(false);
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
  const visibleFundedCompanies =
    persistedFundedCompanies.length > 0 ? persistedFundedCompanies : previewFundedCompanies;
  const visibleProspectContacts =
    persistedProspectContacts.length > 0 ? persistedProspectContacts : previewProspectContacts;
  const visibleOutreachEmails =
    persistedOutreachEmails.length > 0 ? persistedOutreachEmails : previewOutreachEmailRecords;
  const prospectingDashboard = useMemo(
    () =>
      buildProspectingDashboard(
        { companies: visibleFundedCompanies, contacts: visibleProspectContacts },
        { minScore: 0 },
      ),
    [visibleFundedCompanies, visibleProspectContacts],
  );
  const prospectingCompanyDetail = useMemo(
    () =>
      buildProspectingCompanyDetail({
        companyId: selectedProspectingCompanyId,
        companies: visibleFundedCompanies,
        contacts: visibleProspectContacts,
      }),
    [selectedProspectingCompanyId, visibleFundedCompanies, visibleProspectContacts],
  );
  const outreachReviewQueue = useMemo(
    () =>
      buildOutreachReviewQueue({
        companies: visibleFundedCompanies,
        contacts: visibleProspectContacts,
        emails: visibleOutreachEmails,
      }),
    [visibleFundedCompanies, visibleProspectContacts, visibleOutreachEmails],
  );
  const outreachReviewPanel = useMemo(
    () =>
      buildOutreachReviewPanel({
        companies: visibleFundedCompanies,
        contacts: visibleProspectContacts,
        emails: visibleOutreachEmails,
        selectedEmailId: selectedOutreachEmailId,
      }),
    [selectedOutreachEmailId, visibleFundedCompanies, visibleProspectContacts, visibleOutreachEmails],
  );
  const outreachAnalytics = useMemo(
    () => buildOutreachAnalytics(visibleOutreachEmails),
    [visibleOutreachEmails],
  );
  const outreachDailyVolume = useMemo(
    () => buildOutreachDailyVolume(visibleOutreachEmails),
    [visibleOutreachEmails],
  );
  const outreachCompanyAnalytics = useMemo(
    () =>
      buildOutreachCompanyAnalytics({
        companies: visibleFundedCompanies,
        contacts: visibleProspectContacts,
        emails: visibleOutreachEmails,
      }),
    [visibleFundedCompanies, visibleProspectContacts, visibleOutreachEmails],
  );
  const onboardingStatus = useMemo(
    () => buildOnboardingStatus(profile, settings),
    [profile, settings],
  );

  useEffect(() => {
    const selectedExists = applicationTracker.rows.some((application) => application.id === selectedApplicationId);
    if (!selectedExists) {
      setSelectedApplicationId(applicationTracker.rows[0]?.id ?? null);
    }
  }, [applicationTracker, selectedApplicationId]);

  useEffect(() => {
    const selectedExists = visibleFundedCompanies.some((company) => company.id === selectedProspectingCompanyId);
    if (!selectedExists) {
      setSelectedProspectingCompanyId(visibleFundedCompanies[0]?.id ?? null);
    }
  }, [selectedProspectingCompanyId, visibleFundedCompanies]);

  useEffect(() => {
    const selectedExists = outreachReviewQueue.some((email) => email.id === selectedOutreachEmailId);
    if (!selectedExists) {
      setSelectedOutreachEmailId(outreachReviewQueue[0]?.id ?? null);
    }
  }, [outreachReviewQueue, selectedOutreachEmailId]);

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
        storedOnboardingDismissed,
        storedSearchQueries,
        storedPortalSources,
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
        storedFundedCompanies,
        storedOutreachEmails,
      ] = await Promise.all([
        getUserProfile(),
        getSetting("ai.provider"),
        getSetting("application.reviewBeforeSubmit"),
        getSetting("ai.cacheResponses"),
        getSetting("application.maxDailyApplications"),
        getSetting("app.onboardingDismissed"),
        getSetting("discovery.searchQueries"),
        getSetting("discovery.portalSources"),
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
        listFundedCompanies(),
        listOutreachEmails(),
      ]);
      const storedProspectContacts = storedFundedCompanies.length > 0
        ? (await Promise.all(storedFundedCompanies.map((company) => listProspectContacts(company.id)))).flat()
        : [];

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
      if (storedFundedCompanies.length > 0) {
        setPersistedFundedCompanies(storedFundedCompanies);
      }
      if (storedProspectContacts.length > 0) {
        setPersistedProspectContacts(storedProspectContacts);
      }
      if (storedOutreachEmails.length > 0) {
        setPersistedOutreachEmails(storedOutreachEmails);
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
          storedPortalSources?.value,
          current.discovery,
        ),
        email: emailSettingsFromStoredValues(
          storedEmailAccount?.value,
          storedEmailCheck?.value,
          current.email,
        ),
      }));
      if (typeof storedOnboardingDismissed?.value === "boolean") {
        setIsOnboardingDismissed(storedOnboardingDismissed.value);
      }
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

  async function dismissOnboarding() {
    setIsOnboardingDismissed(true);
    if (!isDesktopRuntime()) {
      return;
    }

    await saveSetting({
      key: "app.onboardingDismissed",
      value: true,
      category: "app",
    });
  }

  function openOnboardingStep(step: OnboardingStep) {
    setRoute(step.target);
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

  async function saveOutreachReviewDraft(draft: OutreachReviewDraft) {
    if (!outreachReviewPanel) {
      return;
    }
    const email = visibleOutreachEmails.find((item) => item.id === outreachReviewPanel.id);
    if (!email) {
      return;
    }

    const subject = draft.subject.trim();
    const bodyText = draft.bodyText.trim();
    if (!subject || !bodyText) {
      setWorkflowStatus("outreach draft needs subject and body");
      return;
    }

    const updatedEmail = {
      ...email,
      subject,
      body_html: bodyTextToHtml(bodyText),
    };

    setRunningOutreachReviewAction("save");
    try {
      await updateOutreachEmailReviewRecord(updatedEmail);
      setWorkflowStatus("outreach draft updated");
    } catch {
      setWorkflowStatus("outreach draft update failed");
      setStorageStatus("Storage unavailable");
    } finally {
      setRunningOutreachReviewAction(null);
    }
  }

  async function handleOutreachReviewDecision(decision: OutreachReviewDecision) {
    if (!outreachReviewPanel) {
      return;
    }
    const email = visibleOutreachEmails.find((item) => item.id === outreachReviewPanel.id);
    if (!email) {
      return;
    }

    const updatedEmail = applyOutreachReviewDecision(email, decision);
    setRunningOutreachReviewAction(decision);
    try {
      await updateOutreachEmailReviewRecord(updatedEmail);
      setWorkflowStatus(decision === "approve" ? "outreach email queued for sending" : "outreach email rejected");
    } catch {
      setWorkflowStatus("outreach review action failed");
      setStorageStatus("Storage unavailable");
    } finally {
      setRunningOutreachReviewAction(null);
    }
  }

  async function updateOutreachEmailReviewRecord(updatedEmail: OutreachEmail) {
    if (!isDesktopRuntime() || persistedOutreachEmails.length === 0) {
      setPreviewOutreachEmailRecords((current) =>
        current.map((email) => (email.id === updatedEmail.id ? updatedEmail : email)),
      );
      setStorageStatus("Browser preview");
      return;
    }

    const savedEmail = await updateOutreachEmailReview({
      id: updatedEmail.id,
      subject: updatedEmail.subject,
      bodyHtml: updatedEmail.body_html,
      status: updatedEmail.status,
    });
    const nextEmail = savedEmail ?? updatedEmail;
    setPersistedOutreachEmails((current) =>
      current.map((email) => (email.id === nextEmail.id ? nextEmail : email)),
    );
    setStorageStatus("SQLite ready");
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
            <Button className="icon-button" variant="icon" aria-label="Search">
              <Search size={18} aria-hidden="true" />
            </Button>
            <NotificationInboxButton
              inbox={notificationInbox}
              isOpen={isNotificationInboxOpen}
              onToggle={() => setIsNotificationInboxOpen((current) => !current)}
              onMarkRead={markInboxNotificationRead}
            />
            <Button
              className="secondary-action"
              variant="secondary"
              onClick={startDueScheduledTasks}
              disabled={isRunningSchedules}
            >
              <CalendarClock size={17} aria-hidden="true" />
              {isRunningSchedules ? "Running" : "Run Due Tasks"}
            </Button>
            <Button
              className="primary-action"
              onClick={startDiscovery}
              disabled={isRunningDiscovery}
            >
              <Play size={17} aria-hidden="true" />
              {isRunningDiscovery ? "Running" : "Start Discovery"}
            </Button>
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
            onboardingStatus={onboardingStatus}
            isOnboardingDismissed={isOnboardingDismissed}
            onOpenOnboardingStep={openOnboardingStep}
            onDismissOnboarding={() => {
              void dismissOnboarding().catch(() => setStorageStatus("Onboarding status not saved"));
            }}
          />
        )}
        {route === "jobs" && <Jobs jobs={visibleJobs} />}
        {route === "prospecting" && (
          <Prospecting
            dashboard={prospectingDashboard}
            companies={visibleFundedCompanies}
            detail={prospectingCompanyDetail}
            selectedCompanyId={selectedProspectingCompanyId}
            onSelectCompany={setSelectedProspectingCompanyId}
          />
        )}
        {route === "outreach" && (
          <Outreach
            analytics={outreachAnalytics}
            dailyVolume={outreachDailyVolume}
            companyAnalytics={outreachCompanyAnalytics}
            reviewQueue={outreachReviewQueue}
            reviewPanel={outreachReviewPanel}
            selectedEmailId={selectedOutreachEmailId}
            runningReviewAction={runningOutreachReviewAction}
            onSelectEmail={setSelectedOutreachEmailId}
            onReviewDecision={(decision) => {
              void handleOutreachReviewDecision(decision);
            }}
            onSaveDraft={(draft) => {
              void saveOutreachReviewDraft(draft);
            }}
          />
        )}
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
        {route === "analytics" && (
          <Analytics
            jobs={visibleJobs}
            applicationTracker={applicationTracker}
            schedules={scheduleSummaries}
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
  onboardingStatus,
  isOnboardingDismissed,
  onOpenOnboardingStep,
  onDismissOnboarding,
}: {
  provider: string;
  runtimeStatus: RuntimeControlStatus;
  workflowStatus: string;
  storageStatus: string;
  jobs: JobSummary[];
  schedules: ScheduledTaskSummary[];
  applicationTracker: ApplicationTracker;
  onboardingStatus: OnboardingStatus;
  isOnboardingDismissed: boolean;
  onOpenOnboardingStep: (step: OnboardingStep) => void;
  onDismissOnboarding: () => void;
}) {
  const metrics = [
    { label: "Matched Jobs", value: String(jobs.length), tone: "green" },
    { label: "Queued Applications", value: String(applicationTracker.metrics.queued), tone: "blue" },
    { label: "Follow-ups Due", value: String(applicationTracker.metrics.followUpsDue), tone: "amber" },
    { label: "Active Applications", value: String(applicationTracker.metrics.active), tone: "violet" },
  ];

  return (
    <div className="dashboard-grid">
      {!onboardingStatus.isComplete && !isOnboardingDismissed && (
        <SetupWizard
          status={onboardingStatus}
          onOpenStep={onOpenOnboardingStep}
          onDismiss={onDismissOnboarding}
        />
      )}

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

function Analytics({
  jobs,
  applicationTracker,
  schedules,
}: {
  jobs: JobSummary[];
  applicationTracker: ApplicationTracker;
  schedules: ScheduledTaskSummary[];
}) {
  const totalApplications = applicationTracker.rows.length;
  const responseCount = applicationTracker.rows.filter((row) => row.statusLabel.toLowerCase().includes("response")).length;
  const interviewCount = applicationTracker.rows.filter((row) => row.statusLabel.toLowerCase().includes("interview")).length;
  const responseRate = rateLabel(responseCount, totalApplications);
  const interviewRate = rateLabel(interviewCount, totalApplications);
  const platformCounts = jobs.reduce<Record<string, number>>((counts, job) => {
    counts[job.source] = (counts[job.source] ?? 0) + 1;
    return counts;
  }, {});
  const topPlatforms = Object.entries(platformCounts)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 5);

  return (
    <div className="dashboard-grid">
      <section className="metric-grid" aria-label="Analytics metrics">
        {[
          { label: "Total Applications", value: String(totalApplications), tone: "green" },
          { label: "Response Rate", value: responseRate, tone: "blue" },
          { label: "Interview Rate", value: interviewRate, tone: "amber" },
          { label: "Matched Jobs", value: String(jobs.length), tone: "violet" },
        ].map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="panel wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Funnel</p>
            <h3>Applications by lane</h3>
          </div>
          <BarChart3 size={19} aria-hidden="true" />
        </div>
        <div className="analytics-bars">
          {applicationTracker.columns.map((column) => (
            <div className="analytics-bar-row" key={column.id}>
              <span>{column.label}</span>
              <div aria-hidden="true">
                <b style={{ width: `${Math.min(100, column.rows.length * 18)}%` }} />
              </div>
              <strong>{column.rows.length}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Sources</p>
            <h3>Top platforms</h3>
          </div>
          <BriefcaseBusiness size={19} aria-hidden="true" />
        </div>
        <ul className="timeline">
          {topPlatforms.length > 0 ? (
            topPlatforms.map(([platform, count]) => (
              <li key={platform}>
                <span>{count}</span>
                {platform}
              </li>
            ))
          ) : (
            <li>
              <span>-</span>
              No platform data
            </li>
          )}
        </ul>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Reports</p>
            <h3>Scheduled analytics</h3>
          </div>
          <CalendarClock size={19} aria-hidden="true" />
        </div>
        <ul className="timeline">
          {schedules
            .filter((schedule) => schedule.name.toLowerCase().includes("analytics"))
            .map((schedule) => (
              <li key={schedule.id}>
                <span>{schedule.nextRunLabel}</span>
                {schedule.name}
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

function rateLabel(count: number, total: number): string {
  if (total <= 0) {
    return "0%";
  }
  return `${Math.round((count / total) * 100)}%`;
}

function SetupWizard({
  status,
  onOpenStep,
  onDismiss,
}: {
  status: OnboardingStatus;
  onOpenStep: (step: OnboardingStep) => void;
  onDismiss: () => void;
}) {
  return (
    <section className="panel wide setup-wizard" aria-label="Setup wizard">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Setup wizard</p>
          <h3>{status.completedRequired} of {status.requiredTotal} required steps ready</h3>
        </div>
        <strong>{status.percent}%</strong>
      </div>
      <div className="setup-progress" aria-hidden="true">
        <span style={{ width: `${status.percent}%` }} />
      </div>
      <div className="setup-steps">
        {status.steps.map((step) => (
          <article className={step.complete ? "setup-step complete" : "setup-step"} key={step.id}>
            {step.complete ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <XCircle size={18} aria-hidden="true" />
            )}
            <div>
              <strong>{step.label}</strong>
              <span>{step.optional ? "Optional" : "Required"}</span>
            </div>
            {!step.complete && (
              <button className="secondary-action compact" type="button" onClick={() => onOpenStep(step)}>
                <ArrowRight size={16} aria-hidden="true" />
                Open
              </button>
            )}
          </article>
        ))}
      </div>
      <div className="setup-actions">
        <button className="secondary-action" type="button" onClick={onDismiss}>
          <CheckCheck size={16} aria-hidden="true" />
          Dismiss
        </button>
      </div>
    </section>
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

function Prospecting({
  dashboard,
  companies,
  detail,
  selectedCompanyId,
  onSelectCompany,
}: {
  dashboard: ProspectingDashboard;
  companies: FundedCompany[];
  detail: ProspectingCompanyDetail | null;
  selectedCompanyId: string | null;
  onSelectCompany: (companyId: string) => void;
}) {
  return (
    <div className="dashboard-grid">
      <section className="metric-grid" aria-label="Prospecting metrics">
        {[
          { label: "Funded Companies", value: String(dashboard.summary.companies), tone: "green" },
          { label: "Contacts Found", value: String(dashboard.summary.contacts), tone: "blue" },
          { label: "Average Score", value: String(dashboard.summary.averageScore), tone: "amber" },
          { label: "Review Ready", value: String(dashboard.rows.filter((row) => row.statusLabel === "Review").length), tone: "violet" },
        ].map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="panel wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">ProspectCave</p>
            <h3>Recently funded companies</h3>
          </div>
          <Bot size={19} aria-hidden="true" />
        </div>
        <div className="table-list">
          {dashboard.rows.map((row) => {
            const company = companies.find((item) => item.id === row.id);
            return (
              <button
                className={
                  row.id === selectedCompanyId
                    ? "table-row application-row selected"
                    : "table-row application-row"
                }
                key={row.id}
                type="button"
                onClick={() => onSelectCompany(row.id)}
              >
                <span>{row.companyName}</span>
                <span>{row.fundingLabel}</span>
                <span>{row.contacts} contacts · {row.region}</span>
                <strong>{row.score}</strong>
                {company?.ai_summary && <small>{company.ai_summary}</small>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Company detail</p>
            <h3>{detail?.companyName ?? "Select a company"}</h3>
          </div>
          <ShieldCheck size={19} aria-hidden="true" />
        </div>
        {detail ? (
          <div className="activity-stack">
            <section className="activity-section" aria-label="Prospecting company summary">
              <div className="activity-heading compact">
                <h4>{detail.domainLabel}</h4>
                <strong>{detail.scoreLabel}</strong>
              </div>
              <p>{detail.description}</p>
              <ul className="compact-activity-list">
                <li>
                  <strong>{detail.fundingLabel}</strong>
                  <span>{detail.sourceLabel}</span>
                </li>
                <li>
                  <strong>{detail.leadInvestorLabel}</strong>
                  <span>{detail.investorLabel}</span>
                </li>
                <li>
                  <strong>{detail.statusLabel}</strong>
                  <span>{detail.techStackLabel}</span>
                </li>
              </ul>
              <small>{detail.summary}</small>
            </section>

            <section className="activity-section" aria-label="Prospecting contacts">
              <div className="activity-heading compact">
                <h4>Contacts</h4>
                <strong>{detail.contacts.length}</strong>
              </div>
              <div className="contact-grid">
                {detail.contacts.length > 0 ? (
                  detail.contacts.map((contact) => (
                    <article className="contact-card" key={contact.id}>
                      <div>
                        <strong>{contact.name}</strong>
                        <span>{contact.roleLabel} · {contact.confidenceLabel}</span>
                      </div>
                      <p>{contact.email}</p>
                      <small>{contact.statusLabel} · {contact.sourceLabel}</small>
                    </article>
                  ))
                ) : (
                  <article className="contact-card empty-contact">
                    <div>
                      <strong>No contacts found</strong>
                      <span>Enrichment can add HR, founder, and engineering leads.</span>
                    </div>
                  </article>
                )}
              </div>
            </section>
          </div>
        ) : (
          <p>No company selected.</p>
        )}
      </section>
    </div>
  );
}

function Outreach({
  analytics,
  dailyVolume,
  companyAnalytics,
  reviewQueue,
  reviewPanel,
  selectedEmailId,
  runningReviewAction,
  onSelectEmail,
  onReviewDecision,
  onSaveDraft,
}: {
  analytics: OutreachAnalyticsSummary;
  dailyVolume: OutreachDailyVolumeRow[];
  companyAnalytics: OutreachCompanyAnalyticsRow[];
  reviewQueue: OutreachReviewQueueItem[];
  reviewPanel: OutreachReviewPanel | null;
  selectedEmailId: string | null;
  runningReviewAction: OutreachReviewRunningAction;
  onSelectEmail: (emailId: string) => void;
  onReviewDecision: (decision: OutreachReviewDecision) => void;
  onSaveDraft: (draft: OutreachReviewDraft) => void;
}) {
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<OutreachReviewDraft>({ subject: "", bodyText: "" });

  useEffect(() => {
    if (!reviewPanel) {
      setIsEditingReview(false);
      setReviewDraft({ subject: "", bodyText: "" });
      return;
    }

    setIsEditingReview(false);
    setReviewDraft({ subject: reviewPanel.subject, bodyText: reviewPanel.bodyText });
  }, [reviewPanel?.id, reviewPanel?.subject, reviewPanel?.bodyText]);

  const isRunning = runningReviewAction !== null;

  return (
    <div className="dashboard-grid">
      <section className="metric-grid" aria-label="Outreach metrics">
        {[
          { label: "Sent", value: String(analytics.sent), tone: "green" },
          { label: "Opened", value: `${analytics.opened} (${analytics.openRate}%)`, tone: "blue" },
          { label: "Replied", value: `${analytics.replied} (${analytics.replyRate}%)`, tone: "amber" },
          { label: "Bounced", value: `${analytics.bounced} (${analytics.bounceRate}%)`, tone: "violet" },
        ].map((metric) => (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="panel wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Outreach analytics</p>
            <h3>Sent per day</h3>
          </div>
          <BarChart3 size={19} aria-hidden="true" />
        </div>
        <div className="analytics-bars">
          {dailyVolume.length > 0 ? (
            dailyVolume.map((row) => (
              <div className="analytics-bar-row" key={row.dateLabel}>
                <span>{row.dateLabel}</span>
                <div aria-hidden="true">
                  <b style={{ width: `${row.widthPercent}%` }} />
                </div>
                <strong>{row.count}</strong>
              </div>
            ))
          ) : (
            <div className="table-row">
              <span>No sent outreach yet.</span>
              <span>Approved emails will appear here after sending.</span>
              <span>-</span>
              <strong>0</strong>
            </div>
          )}
        </div>
      </section>

      <section className="panel wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Top companies</p>
            <h3>By response</h3>
          </div>
          <BriefcaseBusiness size={19} aria-hidden="true" />
        </div>
        <div className="table-list">
          {companyAnalytics.length > 0 ? (
            companyAnalytics.map((row) => (
              <div className="table-row company-response-row" key={row.companyName}>
                <span>{row.companyName}</span>
                <span className={`response-pill ${row.responseTone}`}>{row.responseLabel}</span>
                <span>{row.sent} sent · {row.opened} opened · {row.replied} replied</span>
                <strong>
                  {row.bounced > 0
                    ? `${row.bounced} bounced`
                    : `${row.queued + row.pending} queued/review`}
                </strong>
              </div>
            ))
          ) : (
            <div className="table-row">
              <span>No company outreach yet.</span>
              <span>Campaign activity will appear here.</span>
              <span>-</span>
              <strong>0</strong>
            </div>
          )}
        </div>
      </section>

      <section className="panel wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Review queue</p>
            <h3>{reviewQueue.length} emails awaiting approval</h3>
          </div>
          <Send size={19} aria-hidden="true" />
        </div>
        <div className="table-list">
          {reviewQueue.length > 0 ? (
            reviewQueue.map((item) => (
              <button
                className={item.id === selectedEmailId ? "table-row outreach-row selected" : "table-row outreach-row"}
                key={item.id}
                type="button"
                onClick={() => onSelectEmail(item.id)}
              >
                <span>{item.contactLabel}</span>
                <span>{item.companyName}</span>
                <span>{item.subject}</span>
                <strong>Step {item.sequenceStep}</strong>
                <small>{item.bodyPreview}</small>
              </button>
            ))
          ) : (
            <div className="table-row">
              <span>No outreach emails need review.</span>
              <span>Queued campaigns will appear here.</span>
              <span>-</span>
              <strong>0</strong>
            </div>
          )}
        </div>
      </section>

      <section className="panel wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Email review</p>
            <h3>{reviewPanel ? reviewPanel.subject : "No email selected"}</h3>
          </div>
          <FileText size={19} aria-hidden="true" />
        </div>
        {reviewPanel ? (
          <div className="outreach-review-card">
            <dl className="outreach-email-meta">
              <div>
                <dt>To</dt>
                <dd>{reviewPanel.contactLabel}</dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>{reviewPanel.companyName}</dd>
              </div>
              <div>
                <dt>Step</dt>
                <dd>{reviewPanel.sequenceStep}</dd>
              </div>
              <div>
                <dt>Scheduled</dt>
                <dd>{reviewPanel.scheduledAt ?? "Not scheduled"}</dd>
              </div>
            </dl>

            {isEditingReview ? (
              <div className="outreach-editor">
                <label>
                  Subject
                  <input
                    value={reviewDraft.subject}
                    onChange={(event) =>
                      setReviewDraft((current) => ({ ...current, subject: event.target.value }))}
                  />
                </label>
                <label>
                  Body
                  <textarea
                    value={reviewDraft.bodyText}
                    rows={9}
                    onChange={(event) =>
                      setReviewDraft((current) => ({ ...current, bodyText: event.target.value }))}
                  />
                </label>
              </div>
            ) : (
              <div className="outreach-email-body">
                {reviewPanel.bodyText.split(/\n{2,}/).map((paragraph, index) => (
                  <p key={`${index}-${paragraph}`}>{paragraph}</p>
                ))}
              </div>
            )}

            <div className="outreach-review-toolbar">
              <div className="outreach-navigation">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Previous email"
                  disabled={!reviewPanel.previousEmailId || isRunning}
                  onClick={() => reviewPanel.previousEmailId && onSelectEmail(reviewPanel.previousEmailId)}
                >
                  <ArrowLeft size={17} aria-hidden="true" />
                </button>
                <span>{reviewPanel.currentPosition} of {reviewPanel.total}</span>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Next email"
                  disabled={!reviewPanel.nextEmailId || isRunning}
                  onClick={() => reviewPanel.nextEmailId && onSelectEmail(reviewPanel.nextEmailId)}
                >
                  <ArrowRight size={17} aria-hidden="true" />
                </button>
              </div>
              <div className="review-action-group">
                {isEditingReview ? (
                  <>
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={isRunning}
                      onClick={() => {
                        setIsEditingReview(false);
                        setReviewDraft({ subject: reviewPanel.subject, bodyText: reviewPanel.bodyText });
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary-action"
                      type="button"
                      disabled={isRunning}
                      onClick={() => {
                        onSaveDraft(reviewDraft);
                        setIsEditingReview(false);
                      }}
                    >
                      {runningReviewAction === "save" ? "Saving" : "Save Draft"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={isRunning}
                      onClick={() => setIsEditingReview(true)}
                    >
                      <FileText size={17} aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      className="primary-action"
                      type="button"
                      disabled={isRunning}
                      onClick={() => onReviewDecision("approve")}
                    >
                      <CheckCircle2 size={17} aria-hidden="true" />
                      {runningReviewAction === "approve" ? "Approving" : "Approve & Send"}
                    </button>
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={isRunning}
                      onClick={() => onReviewDecision("reject")}
                    >
                      <XCircle size={17} aria-hidden="true" />
                      {runningReviewAction === "reject" ? "Rejecting" : "Reject"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p>No pending outreach emails are waiting for review.</p>
        )}
      </section>
    </div>
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
  const [databaseEncryptionStatus, setDatabaseEncryptionStatus] =
    useState<DatabaseEncryptionStatus | null>(null);
  const [databasePassphrase, setDatabasePassphrase] = useState("");
  const [isUpdatingDatabaseEncryption, setIsUpdatingDatabaseEncryption] = useState(false);
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

  useEffect(() => {
    let isMounted = true;

    async function loadDatabaseEncryptionStatus() {
      if (!isDesktopRuntime()) {
        return;
      }

      try {
        const status = await getDatabaseEncryptionStatus();
        if (isMounted) {
          setDatabaseEncryptionStatus(status);
        }
      } catch {
        if (isMounted) {
          setDatabaseEncryptionStatus(null);
        }
      }
    }

    void loadDatabaseEncryptionStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  async function updateDatabaseEncryption(enabled: boolean) {
    if (!isDesktopRuntime()) {
      onStatusChange("Browser preview");
      return;
    }

    setIsUpdatingDatabaseEncryption(true);
    try {
      const status = await configureDatabaseEncryption(
        enabled,
        enabled ? databasePassphrase : undefined,
      );
      setDatabaseEncryptionStatus(status);
      setDatabasePassphrase("");
      onStatusChange(status.enabled ? "SQLite encrypted" : "SQLite ready");
    } catch {
      onStatusChange("Database encryption unavailable");
    } finally {
      setIsUpdatingDatabaseEncryption(false);
    }
  }

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
          key: "discovery.portalSources",
          value: discoveryValues.portalSources,
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
          {["ollama", "openrouter", "openai", "anthropic", "groq"].map((option) => (
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
        <legend>Job portals</legend>
        <div className="settings-grid">
          {([
            ["portalLinkedIn", "LinkedIn"],
            ["portalIndeed", "Indeed"],
            ["portalInternshala", "Internshala"],
            ["portalNaukri", "Naukri"],
            ["portalWellfound", "Wellfound"],
            ["portalGlassdoor", "Glassdoor"],
          ] as const).map(([key, label]) => (
            <label className="toggle-row settings-toggle" key={key}>
              <input
                type="checkbox"
                checked={settings.discovery[key]}
                onChange={(event) => updateDiscovery(key, event.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
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
          <label>
            Workday tenant
            <input
              value={settings.discovery.workdayTenant}
              onChange={(event) => updateDiscovery("workdayTenant", event.target.value)}
            />
          </label>
          <label>
            Workday site
            <input
              value={settings.discovery.workdaySite}
              onChange={(event) => updateDiscovery("workdaySite", event.target.value)}
            />
          </label>
          <label>
            BambooHR subdomain
            <input
              value={settings.discovery.bambooHrSubdomain}
              onChange={(event) => updateDiscovery("bambooHrSubdomain", event.target.value)}
            />
          </label>
          <label>
            iCIMS search URL
            <input
              value={settings.discovery.icimsSearchUrl}
              onChange={(event) => updateDiscovery("icimsSearchUrl", event.target.value)}
            />
          </label>
          <label>
            iCIMS company
            <input
              value={settings.discovery.icimsCompany}
              onChange={(event) => updateDiscovery("icimsCompany", event.target.value)}
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
      <fieldset className="settings-section">
        <legend>Database privacy</legend>
        <div className="settings-grid">
          <label>
            Encryption key
            <input
              type="password"
              value={databasePassphrase}
              disabled={databaseEncryptionStatus?.enabled || isUpdatingDatabaseEncryption}
              onChange={(event) => setDatabasePassphrase(event.target.value)}
            />
          </label>
          <label>
            Status
            <input
              value={
                databaseEncryptionStatus?.enabled
                  ? "Encrypted"
                  : databaseEncryptionStatus?.available
                    ? "Plain SQLite"
                    : "SQLCipher unavailable"
              }
              readOnly
            />
          </label>
        </div>
        <div className="form-actions">
          {databaseEncryptionStatus?.enabled ? (
            <button
              className="secondary-action"
              type="button"
              onClick={() => void updateDatabaseEncryption(false)}
              disabled={isUpdatingDatabaseEncryption}
            >
              Disable Encryption
            </button>
          ) : (
            <button
              className="secondary-action"
              type="button"
              onClick={() => void updateDatabaseEncryption(true)}
              disabled={
                isUpdatingDatabaseEncryption ||
                !databaseEncryptionStatus?.available ||
                databasePassphrase.trim().length === 0
              }
            >
              Enable Encryption
            </button>
          )}
        </div>
      </fieldset>
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

function bodyTextToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function fundedCompanyRecord(overrides: Partial<FundedCompany>): FundedCompany {
  return {
    id: "preview-funded-company",
    name: "Funded Company",
    domain: "company.example",
    description: "Recently funded startup",
    industry: "Technology",
    tech_stack: ["React", "Node.js"],
    funding_stage: "seed",
    funding_amount: null,
    funding_currency: "USD",
    funding_date: "2026-05-01T00:00:00.000Z",
    investors: [],
    lead_investor: null,
    source: "inc42",
    source_url: "https://source.example/company",
    region: "india",
    relevance_score: 70,
    ai_summary: null,
    status: "discovered",
    created_at: "2026-05-23T04:30:00.000Z",
    updated_at: "2026-05-23T04:30:00.000Z",
    ...overrides,
  };
}

function prospectContactRecord(overrides: Partial<ProspectContact>): ProspectContact {
  return {
    id: "preview-prospect-contact",
    company_id: "preview-funded-company",
    full_name: "Prospect Contact",
    email: "contact@company.example",
    email_confidence: 0.8,
    email_status: "valid",
    role: "recruiter",
    linkedin_url: null,
    source: "hunter",
    opted_out: false,
    created_at: "2026-05-23T04:30:00.000Z",
    ...overrides,
  };
}

function outreachEmailRecord(overrides: Partial<OutreachEmail>): OutreachEmail {
  return {
    id: "preview-outreach-email",
    campaign_id: "preview-campaign",
    contact_id: "preview-prospect-contact",
    sequence_step: 1,
    subject: "Congrats on the funding",
    body_html: "<p>Hi, saw the funding news. Open to a quick chat?</p>",
    status: "pending",
    scheduled_at: "2026-05-23T04:30:00.000Z",
    sent_at: null,
    message_id: null,
    created_at: "2026-05-23T04:30:00.000Z",
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
