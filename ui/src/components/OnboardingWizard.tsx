import { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../lib/i18n";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdapterEnvironmentTestResult,
  SupportedLocale,
} from "@atototo/shared";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { companiesApi } from "../api/companies";
import { goalsApi } from "../api/goals";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import { getUIAdapter } from "../adapters";
import { defaultCreateValues } from "./agent-config-defaults";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from "@atototo/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@atototo/adapter-cursor-local";
import { DEFAULT_OPENCODE_LOCAL_MODEL } from "@atototo/adapter-opencode-local";
import { AsciiArtAnimation } from "./AsciiArtAnimation";
import { ChoosePathButton } from "./PathInstructionsModal";
import { HintIcon } from "./agent-config-primitives";
import { InlineHelp } from "./InlineHelp";
import {
  Building2,
  Bot,
  Code,
  ListTodo,
  Rocket,
  ArrowLeft,
  ArrowRight,
  Terminal,
  Globe,
  Sparkles,
  MousePointer2,
  Check,
  Loader2,
  FolderOpen,
  ChevronDown,
  X,
} from "lucide-react";

type Step = 1 | 2 | 3 | 4 | 5;
type AdapterType =
  | "claude_local"
  | "codex_local"
  | "opencode_local"
  | "cursor"
  | "process"
  | "http";

const onboardingSteps = {
  intro: 1,
  company: 2,
  agent: 3,
  task: 4,
  launch: 5,
} as const satisfies Record<string, Step>;

function getNextOnboardingStep(step: Exclude<Step, 5>): Step {
  return (step + 1) as Step;
}

function getOnboardingLocale(language?: string | null): SupportedLocale {
  return language?.startsWith("ko") ? "ko" : "en";
}

function getDefaultAgentName(t: (key: string) => string) {
  return t("onboarding.defaultAgentName");
}

function getDefaultTaskTitle(t: (key: string) => string) {
  return t("onboarding.defaultTaskTitle");
}

function getDefaultTaskDescription(t: (key: string) => string) {
  return t("onboarding.defaultTaskDescription");
}

export function OnboardingWizard() {
  const { t } = useTranslation();
  const { onboardingOpen, onboardingOptions, closeOnboarding } = useDialog();
  const { companies, setSelectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const initialStep = onboardingOptions.initialStep ?? onboardingSteps.intro;
  const existingCompanyId = onboardingOptions.companyId;

  const [step, setStep] = useState<Step>(initialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelOpen, setModelOpen] = useState(false);

  // Step 2
  const [companyName, setCompanyName] = useState("");
  const [companyGoal, setCompanyGoal] = useState("");
  const [companyLocale, setCompanyLocale] = useState<SupportedLocale>(() =>
    getOnboardingLocale(i18n.language)
  );

  // Step 3
  const [agentName, setAgentName] = useState(() => getDefaultAgentName(t));
  const [adapterType, setAdapterType] = useState<AdapterType>("claude_local");
  const [cwd, setCwd] = useState("");
  const [model, setModel] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [adapterEnvResult, setAdapterEnvResult] =
    useState<AdapterEnvironmentTestResult | null>(null);
  const [adapterEnvError, setAdapterEnvError] = useState<string | null>(null);
  const [adapterEnvLoading, setAdapterEnvLoading] = useState(false);
  const [forceUnsetAnthropicApiKey, setForceUnsetAnthropicApiKey] =
    useState(false);
  const [unsetAnthropicLoading, setUnsetAnthropicLoading] = useState(false);

  // Step 4
  const [taskTitle, setTaskTitle] = useState(() => getDefaultTaskTitle(t));
  const [taskDescription, setTaskDescription] = useState(() =>
    getDefaultTaskDescription(t)
  );

  // Auto-grow textarea for task description
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  // Created entity IDs — pre-populate from existing company when skipping step 1
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(
    existingCompanyId ?? null
  );
  const [createdCompanyPrefix, setCreatedCompanyPrefix] = useState<
    string | null
  >(null);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [createdIssueRef, setCreatedIssueRef] = useState<string | null>(null);

  // Sync step and company when onboarding opens with options.
  // Keep this independent from company-list refreshes so Step 1 completion
  // doesn't get reset after creating a company.
  useEffect(() => {
    if (!onboardingOpen) return;
    const cId = onboardingOptions.companyId ?? null;
    setStep(onboardingOptions.initialStep ?? onboardingSteps.intro);
    setCreatedCompanyId(cId);
    setCreatedCompanyPrefix(null);
  }, [
    onboardingOpen,
    onboardingOptions.companyId,
    onboardingOptions.initialStep,
  ]);

  // Backfill issue prefix for an existing company once companies are loaded.
  useEffect(() => {
    if (!onboardingOpen || !createdCompanyId || createdCompanyPrefix) return;
    const company = companies.find((c) => c.id === createdCompanyId);
    if (company) setCreatedCompanyPrefix(company.issuePrefix);
  }, [onboardingOpen, createdCompanyId, createdCompanyPrefix, companies]);

  // Resize textarea when the task step is shown or description changes
  useEffect(() => {
    if (step === onboardingSteps.task) autoResizeTextarea();
  }, [step, taskDescription, autoResizeTextarea]);

  const { data: adapterModels } = useQuery({
    queryKey: ["adapter-models", adapterType],
    queryFn: () => agentsApi.adapterModels(adapterType),
    enabled: onboardingOpen && step === onboardingSteps.agent,
  });
  const isLocalAdapter =
    adapterType === "claude_local" ||
    adapterType === "codex_local" ||
    adapterType === "opencode_local" ||
    adapterType === "cursor";
  const effectiveAdapterCommand =
    command.trim() ||
    (adapterType === "codex_local"
      ? "codex"
      : adapterType === "cursor"
      ? "agent"
      : adapterType === "opencode_local"
      ? "opencode"
      : "claude");

  useEffect(() => {
    if (step !== onboardingSteps.agent) return;
    setAdapterEnvResult(null);
    setAdapterEnvError(null);
  }, [step, adapterType, cwd, model, command, args, url]);

  const selectedModel = (adapterModels ?? []).find((m) => m.id === model);
  const hasAnthropicApiKeyOverrideCheck =
    adapterEnvResult?.checks.some(
      (check) =>
        check.code === "claude_anthropic_api_key_overrides_subscription"
    ) ?? false;
  const shouldSuggestUnsetAnthropicApiKey =
    adapterType === "claude_local" &&
    adapterEnvResult?.status === "fail" &&
    hasAnthropicApiKeyOverrideCheck;

  function reset() {
    setStep(onboardingSteps.intro);
    setLoading(false);
    setError(null);
    setCompanyName("");
    setCompanyGoal("");
    setCompanyLocale(getOnboardingLocale(i18n.language));
    setAgentName(getDefaultAgentName(t));
    setAdapterType("claude_local");
    setCwd("");
    setModel("");
    setCommand("");
    setArgs("");
    setUrl("");
    setAdapterEnvResult(null);
    setAdapterEnvError(null);
    setAdapterEnvLoading(false);
    setForceUnsetAnthropicApiKey(false);
    setUnsetAnthropicLoading(false);
    setTaskTitle(getDefaultTaskTitle(t));
    setTaskDescription(getDefaultTaskDescription(t));
    setCreatedCompanyId(null);
    setCreatedCompanyPrefix(null);
    setCreatedAgentId(null);
    setCreatedIssueRef(null);
  }

  function handleClose() {
    reset();
    closeOnboarding();
  }

  function buildAdapterConfig(): Record<string, unknown> {
    const adapter = getUIAdapter(adapterType);
    const config = adapter.buildAdapterConfig({
      ...defaultCreateValues,
      adapterType,
      cwd,
      model:
        adapterType === "codex_local"
          ? model || DEFAULT_CODEX_LOCAL_MODEL
          : adapterType === "cursor"
          ? model || DEFAULT_CURSOR_LOCAL_MODEL
          : adapterType === "opencode_local"
          ? model || DEFAULT_OPENCODE_LOCAL_MODEL
          : model,
      command,
      args,
      url,
      dangerouslySkipPermissions: adapterType === "claude_local",
      dangerouslyBypassSandbox:
        adapterType === "codex_local"
          ? DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX
          : defaultCreateValues.dangerouslyBypassSandbox,
    });
    if (adapterType === "claude_local" && forceUnsetAnthropicApiKey) {
      const env =
        typeof config.env === "object" &&
        config.env !== null &&
        !Array.isArray(config.env)
          ? { ...(config.env as Record<string, unknown>) }
          : {};
      env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
      config.env = env;
    }
    return config;
  }

  async function runAdapterEnvironmentTest(
    adapterConfigOverride?: Record<string, unknown>
  ): Promise<AdapterEnvironmentTestResult | null> {
    if (!createdCompanyId) {
      setAdapterEnvError(
        t("onboarding.errors.selectCompanyBeforeEnvTest")
      );
      return null;
    }
    setAdapterEnvLoading(true);
    setAdapterEnvError(null);
    try {
      const result = await agentsApi.testEnvironment(
        createdCompanyId,
        adapterType,
        {
          adapterConfig: adapterConfigOverride ?? buildAdapterConfig(),
        }
      );
      setAdapterEnvResult(result);
      return result;
    } catch (err) {
      setAdapterEnvError(
        err instanceof Error
          ? err.message
          : t("onboarding.errors.adapterEnvTestFailed")
      );
      return null;
    } finally {
      setAdapterEnvLoading(false);
    }
  }

  async function handleCompanyStepNext() {
    setLoading(true);
    setError(null);
    try {
      const companyPayload = {
        name: companyName.trim(),
        locale: companyLocale,
      };
      const company = await companiesApi.create(companyPayload);
      setCreatedCompanyId(company.id);
      setCreatedCompanyPrefix(company.issuePrefix);
      setSelectedCompanyId(company.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });

      if (companyGoal.trim()) {
        await goalsApi.create(company.id, {
          title: companyGoal.trim(),
          level: "company",
          status: "active",
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.goals.list(company.id),
        });
      }

      setStep(getNextOnboardingStep(onboardingSteps.company));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("onboarding.errors.createCompany")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAgentStepNext() {
    if (!createdCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      if (isLocalAdapter) {
        const result = adapterEnvResult ?? (await runAdapterEnvironmentTest());
        if (!result) return;
      }

      const agent = await agentsApi.create(createdCompanyId, {
        name: agentName.trim(),
        role: "ceo",
        adapterType,
        adapterConfig: buildAdapterConfig(),
        runtimeConfig: {
          heartbeat: {
            enabled: true,
            intervalSec: 3600,
            wakeOnDemand: true,
            cooldownSec: 10,
            maxConcurrentRuns: 1,
          },
        },
      });
      setCreatedAgentId(agent.id);
      queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(createdCompanyId),
      });
      setStep(getNextOnboardingStep(onboardingSteps.agent));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("onboarding.errors.createAgent")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleUnsetAnthropicApiKey() {
    if (!createdCompanyId || unsetAnthropicLoading) return;
    setUnsetAnthropicLoading(true);
    setError(null);
    setAdapterEnvError(null);
    setForceUnsetAnthropicApiKey(true);

    const configWithUnset = (() => {
      const config = buildAdapterConfig();
      const env =
        typeof config.env === "object" &&
        config.env !== null &&
        !Array.isArray(config.env)
          ? { ...(config.env as Record<string, unknown>) }
          : {};
      env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
      config.env = env;
      return config;
    })();

    try {
      if (createdAgentId) {
        await agentsApi.update(
          createdAgentId,
          { adapterConfig: configWithUnset },
          createdCompanyId
        );
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.list(createdCompanyId),
        });
      }

      const result = await runAdapterEnvironmentTest(configWithUnset);
      if (result?.status === "fail") {
        setError(t("onboarding.errors.unsetAnthropicRetryStillFailing"));
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("onboarding.errors.unsetAnthropicRetryFailed")
      );
    } finally {
      setUnsetAnthropicLoading(false);
    }
  }

  async function handleTaskStepNext() {
    if (!createdCompanyId || !createdAgentId) return;
    setLoading(true);
    setError(null);
    try {
      const issue = await issuesApi.create(createdCompanyId, {
        title: taskTitle.trim(),
        ...(taskDescription.trim()
          ? { description: taskDescription.trim() }
          : {}),
        assigneeAgentId: createdAgentId,
        status: "todo",
      });
      setCreatedIssueRef(issue.identifier ?? issue.id);
      queryClient.invalidateQueries({
        queryKey: queryKeys.issues.list(createdCompanyId),
      });
      setStep(getNextOnboardingStep(onboardingSteps.task));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("onboarding.errors.createTask")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLaunch() {
    if (!createdAgentId) return;
    setLoading(true);
    setError(null);
    setLoading(false);
    reset();
    closeOnboarding();
    if (createdCompanyPrefix && createdIssueRef) {
      navigate(`/${createdCompanyPrefix}/issues/${createdIssueRef}`);
      return;
    }
    if (createdCompanyPrefix) {
      navigate(`/${createdCompanyPrefix}/dashboard`);
      return;
    }
    navigate("/dashboard");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (step === onboardingSteps.intro) {
        setStep(getNextOnboardingStep(onboardingSteps.intro));
      } else if (step === onboardingSteps.company && companyName.trim()) {
        void handleCompanyStepNext();
      } else if (step === onboardingSteps.agent && agentName.trim()) {
        void handleAgentStepNext();
      } else if (step === onboardingSteps.task && taskTitle.trim()) {
        void handleTaskStepNext();
      } else if (step === onboardingSteps.launch) {
        void handleLaunch();
      }
    }
  }

  if (!onboardingOpen) return null;

  return (
    <Dialog
      open={onboardingOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogPortal>
        {/* Plain div instead of DialogOverlay — Radix's overlay wraps in
            RemoveScroll which blocks wheel events on our custom (non-DialogContent)
            scroll container. A plain div preserves the background without scroll-locking. */}
        <div className="fixed inset-0 z-50 bg-background" />
        <div className="fixed inset-0 z-50 flex" onKeyDown={handleKeyDown}>
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 left-4 z-10 rounded-sm p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">{t("onboarding.close")}</span>
          </button>

          {/* Left half — form */}
          <div className="w-full md:w-1/2 flex flex-col overflow-y-auto">
            <div className="w-full max-w-lg mx-auto my-auto px-8 py-12 shrink-0">
              {/* Progress indicators */}
              <div className="flex items-center gap-2 mb-8">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {t("onboarding.getStarted")}
                </span>
                <span className="text-sm text-muted-foreground/60">
                  {t("onboarding.stepOf", { step, total: 5 })}
                </span>
                <div className="flex items-center gap-1.5 ml-auto">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <div
                      key={s}
                      className={cn(
                        "h-1.5 w-6 rounded-full transition-colors",
                        s < step
                          ? "bg-green-500"
                          : s === step
                          ? "bg-foreground"
                          : "bg-muted"
                      )}
                    />
                  ))}
                </div>
              </div>

              {/* Step content */}
              {step === onboardingSteps.intro && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2">
                      <Rocket className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">
                        {t("onboarding.learnBaton")}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {t("onboarding.learnBatonDesc")}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <div className="space-y-3">
                      {[
                        {
                          key: "company",
                          icon: Building2,
                          tone: "bg-sky-500/10 text-sky-300 border-sky-500/20",
                        },
                        {
                          key: "project",
                          icon: FolderOpen,
                          tone:
                            "bg-violet-500/10 text-violet-300 border-violet-500/20",
                        },
                        {
                          key: "agent",
                          icon: Bot,
                          tone:
                            "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
                        },
                        {
                          key: "issue",
                          icon: ListTodo,
                          tone:
                            "bg-amber-500/10 text-amber-300 border-amber-500/20",
                        },
                      ].map((item, index, items) => (
                        <div key={item.key}>
                          <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/40 p-3">
                            <div
                              className={cn(
                                "mt-0.5 rounded-md border p-2",
                                item.tone
                              )}
                            >
                              <item.icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">
                                {t(`onboarding.batonMap.${item.key}.title`)}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {t(
                                  `onboarding.batonMap.${item.key}.description`
                                )}
                              </p>
                            </div>
                          </div>
                          {index < items.length - 1 ? (
                            <div className="ml-5 h-4 w-px bg-border" />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <InlineHelp
                    title={t("onboarding.statusFlowTitle")}
                    summary={t("onboarding.statusFlowSummary")}
                    defaultOpen={false}
                  >
                    <div className="space-y-2">
                      {[
                        "backlog",
                        "todo",
                        "inProgress",
                        "done",
                        "blocked",
                      ].map((status) => (
                        <div
                          key={status}
                          className="rounded-md border border-border/70 bg-background/30 px-3 py-2"
                        >
                          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-foreground/80">
                            {t(`onboarding.statusFlow.${status}.label`)}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {t(`onboarding.statusFlow.${status}.description`)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </InlineHelp>
                </div>
              )}

              {step === onboardingSteps.company && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">
                        {t("onboarding.nameCompany")}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {t("onboarding.nameCompanyDesc")}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("onboarding.companyName")}
                    </label>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                      placeholder={t("onboarding.companyNamePlaceholder")}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("onboarding.missionGoal")}
                    </label>
                    <textarea
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 resize-none min-h-[60px]"
                      placeholder={t("onboarding.missionPlaceholder")}
                      value={companyGoal}
                      onChange={(e) => setCompanyGoal(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("onboarding.language")}
                    </label>
                    <select
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring text-foreground"
                      value={companyLocale}
                      onChange={(e) => {
                        const nextLocale = e.target.value as SupportedLocale;
                        setCompanyLocale(nextLocale);
                        void i18n.changeLanguage(nextLocale);
                      }}
                    >
                      <option value="en">{t("settings.languageEnglish")}</option>
                      <option value="ko">{t("settings.languageKorean")}</option>
                    </select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {t("onboarding.languageHint")}
                    </p>
                  </div>
                </div>
              )}

              {step === onboardingSteps.agent && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2">
                      <Bot className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">
                        {t("onboarding.createAgent")}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {t("onboarding.createAgentDesc")}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("onboarding.agentName")}
                    </label>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                      placeholder={t("onboarding.defaultAgentName")}
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      autoFocus
                    />
                  </div>

                  {/* Adapter type radio cards */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-2 block">
                      {t("onboarding.adapterType")}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          value: "claude_local" as const,
                          label: t("onboarding.claudeCode"),
                          icon: Sparkles,
                          desc: t("onboarding.claudeCodeDesc"),
                          recommended: true,
                        },
                        {
                          value: "codex_local" as const,
                          label: t("onboarding.codex"),
                          icon: Code,
                          desc: t("onboarding.codexDesc"),
                          recommended: true,
                        },
                        {
                          value: "opencode_local" as const,
                          label: t("onboarding.openCode"),
                          icon: Code,
                          desc: t("onboarding.openCodeDesc"),
                        },
                        {
                          value: "cursor" as const,
                          label: t("onboarding.cursor"),
                          icon: MousePointer2,
                          desc: t("onboarding.cursorDesc"),
                        },
                        {
                          value: "process" as const,
                          label: t("onboarding.shellCommand"),
                          icon: Terminal,
                          desc: t("onboarding.shellCommandDesc"),
                          comingSoon: true,
                        },
                        {
                          value: "http" as const,
                          label: t("onboarding.httpWebhook"),
                          icon: Globe,
                          desc: t("onboarding.httpWebhookDesc"),
                          comingSoon: true,
                        },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          disabled={!!opt.comingSoon}
                          className={cn(
                            "flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs transition-colors relative",
                            opt.comingSoon
                              ? "border-border opacity-40 cursor-not-allowed"
                              : adapterType === opt.value
                              ? "border-foreground bg-accent"
                              : "border-border hover:bg-accent/50"
                          )}
                          onClick={() => {
                            if (opt.comingSoon) return;
                            const nextType = opt.value as AdapterType;
                            setAdapterType(nextType);
                            if (nextType === "codex_local" && !model) {
                              setModel(DEFAULT_CODEX_LOCAL_MODEL);
                            } else if (nextType === "cursor" && !model) {
                              setModel(DEFAULT_CURSOR_LOCAL_MODEL);
                            } else if (
                              nextType === "opencode_local" &&
                              !model
                            ) {
                              setModel(DEFAULT_OPENCODE_LOCAL_MODEL);
                            }
                          }}
                        >
                          {opt.recommended && (
                            <span className="absolute -top-1.5 -right-1.5 bg-green-500 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
                              {t("onboarding.recommended")}
                            </span>
                          )}
                          <opt.icon className="h-4 w-4" />
                          <span className="font-medium">{opt.label}</span>
                          <span className="text-muted-foreground text-[10px]">
                            {opt.comingSoon
                              ? t("onboarding.comingSoon")
                              : opt.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Conditional adapter fields */}
                  {(adapterType === "claude_local" ||
                    adapterType === "codex_local" ||
                    adapterType === "opencode_local" ||
                    adapterType === "cursor") && (
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <label className="text-xs text-muted-foreground">
                            {t("onboarding.workingDirectory")}
                          </label>
                          <HintIcon
                            hint={t("onboarding.workingDirectoryHint")}
                          />
                        </div>
                        <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
                          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <input
                            className="w-full bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/50"
                            placeholder={t("onboarding.workingDirectoryPlaceholder")}
                            value={cwd}
                            onChange={(e) => setCwd(e.target.value)}
                          />
                          <ChoosePathButton />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          {t("onboarding.model")}
                        </label>
                        <Popover open={modelOpen} onOpenChange={setModelOpen}>
                          <PopoverTrigger asChild>
                            <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent/50 transition-colors w-full justify-between">
                              <span
                                className={cn(
                                  !model && "text-muted-foreground"
                                )}
                              >
                                {selectedModel
                                  ? selectedModel.label
                                  : model || t("onboarding.default")}
                              </span>
                              <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[var(--radix-popover-trigger-width)] p-1"
                            align="start"
                          >
                            <button
                              className={cn(
                                "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                                !model && "bg-accent"
                              )}
                              onClick={() => {
                                setModel("");
                                setModelOpen(false);
                              }}
                            >
                              {t("onboarding.default")}
                            </button>
                            {(adapterModels ?? []).map((m) => (
                              <button
                                key={m.id}
                                className={cn(
                                  "flex items-center justify-between w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                                  m.id === model && "bg-accent"
                                )}
                                onClick={() => {
                                  setModel(m.id);
                                  setModelOpen(false);
                                }}
                              >
                                <span>{m.label}</span>
                                <span className="text-xs text-muted-foreground font-mono">
                                  {m.id}
                                </span>
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}

                  {isLocalAdapter && (
                    <div className="space-y-2 rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium">
                            {t("onboarding.adapterEnvCheck")}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {t("onboarding.adapterEnvCheckDesc")}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs"
                          disabled={adapterEnvLoading}
                          onClick={() => void runAdapterEnvironmentTest()}
                        >
                          {adapterEnvLoading
                            ? t("onboarding.testing")
                            : t("onboarding.testNow")}
                        </Button>
                      </div>

                      {adapterEnvError && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
                          {adapterEnvError}
                        </div>
                      )}

                      {adapterEnvResult && (
                        <AdapterEnvironmentResult result={adapterEnvResult} />
                      )}

                      {shouldSuggestUnsetAnthropicApiKey && (
                        <div className="rounded-md border border-amber-300/60 bg-amber-50/40 px-2.5 py-2 space-y-2">
                          <p className="text-[11px] text-amber-900/90 leading-relaxed">
                            {t("onboarding.anthropicKeyWarning")}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs"
                            disabled={
                              adapterEnvLoading || unsetAnthropicLoading
                            }
                            onClick={() => void handleUnsetAnthropicApiKey()}
                          >
                            {unsetAnthropicLoading
                              ? t("onboarding.retrying")
                              : t("onboarding.unsetAnthropicKey")}
                          </Button>
                        </div>
                      )}

                      <div className="rounded-md border border-border/70 bg-muted/20 px-2.5 py-2 text-[11px] space-y-1.5">
                        <p className="font-medium">
                          {t("onboarding.manualDebug")}
                        </p>
                        <p className="text-muted-foreground font-mono break-all">
                          {adapterType === "cursor"
                            ? `${effectiveAdapterCommand} -p --mode ask --output-format json "${t("onboarding.manualDebugPrompt")}"`
                            : adapterType === "codex_local"
                            ? `${effectiveAdapterCommand} exec --json -`
                            : adapterType === "opencode_local"
                            ? `${effectiveAdapterCommand} run --format json "${t("onboarding.manualDebugPrompt")}"`
                            : `${effectiveAdapterCommand} --print - --output-format stream-json --verbose`}
                        </p>
                        <p className="text-muted-foreground">
                          {t("onboarding.prompt")}{" "}
                          <span className="font-mono">
                            {t("onboarding.manualDebugPrompt")}
                          </span>
                        </p>
                        {adapterType === "cursor" ||
                        adapterType === "codex_local" ||
                        adapterType === "opencode_local" ? (
                          <p className="text-muted-foreground">
                            {t("onboarding.authFailurePrefix")}{" "}
                            <span className="font-mono">
                              {adapterType === "cursor"
                                ? "CURSOR_API_KEY"
                                : "OPENAI_API_KEY"}
                            </span>{" "}
                            {t("onboarding.authFailureMiddle")}{" "}
                            <span className="font-mono">
                              {adapterType === "cursor"
                                ? "agent login"
                                : adapterType === "codex_local"
                                ? "codex login"
                                : "opencode auth login"}
                            </span>
                            {t("onboarding.authFailureSuffix")}
                          </p>
                        ) : (
                          <p className="text-muted-foreground">
                            {t("onboarding.loginRequiredPrefix")}{" "}
                            <span className="font-mono">
                              {t("onboarding.claudeLoginCommand")}
                            </span>{" "}
                            {t("onboarding.loginRequiredSuffix")}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {adapterType === "process" && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          {t("onboarding.command")}
                        </label>
                        <input
                          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                          placeholder={t("onboarding.commandPlaceholder")}
                          value={command}
                          onChange={(e) => setCommand(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          {t("onboarding.args")}
                        </label>
                        <input
                          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                          placeholder={t("onboarding.argsPlaceholder")}
                          value={args}
                          onChange={(e) => setArgs(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {adapterType === "http" && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        {t("onboarding.webhookUrl")}
                      </label>
                      <input
                        className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                        placeholder={t("onboarding.webhookPlaceholder")}
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              {step === onboardingSteps.task && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2">
                      <ListTodo className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">
                        {t("onboarding.giveTask")}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {t("onboarding.giveTaskDesc")}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("onboarding.taskTitle")}
                    </label>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                      placeholder={t("onboarding.taskTitlePlaceholder")}
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("onboarding.descriptionOptional")}
                    </label>
                    <textarea
                      ref={textareaRef}
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 resize-none min-h-[120px] max-h-[300px] overflow-y-auto"
                      placeholder={t("onboarding.descriptionPlaceholder")}
                      value={taskDescription}
                      onChange={(e) => setTaskDescription(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {step === onboardingSteps.launch && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2">
                      <Rocket className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">
                        {t("onboarding.readyToLaunch")}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {t("onboarding.readyToLaunchDesc")}
                      </p>
                    </div>
                  </div>
                  <div className="border border-border divide-y divide-border">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {companyName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("onboarding.company")}
                        </p>
                      </div>
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {agentName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getUIAdapter(adapterType).label}
                        </p>
                      </div>
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <ListTodo className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {taskTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("onboarding.task")}
                        </p>
                      </div>
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-3">
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}

              {/* Footer navigation */}
              <div className="flex items-center justify-between mt-8">
                <div>
                  {step > onboardingSteps.intro &&
                    step >
                      (onboardingOptions.initialStep ??
                        onboardingSteps.intro) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep((step - 1) as Step)}
                      disabled={loading}
                    >
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                      {t("onboarding.back")}
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {step === onboardingSteps.intro && (
                    <Button
                      size="sm"
                      disabled={loading}
                      onClick={() =>
                        setStep(getNextOnboardingStep(onboardingSteps.intro))
                      }
                    >
                      <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      {t("onboarding.next")}
                    </Button>
                  )}
                  {step === onboardingSteps.company && (
                    <Button
                      size="sm"
                      disabled={!companyName.trim() || loading}
                      onClick={handleCompanyStepNext}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading
                        ? t("onboarding.creating")
                        : t("onboarding.next")}
                    </Button>
                  )}
                  {step === onboardingSteps.agent && (
                    <Button
                      size="sm"
                      disabled={
                        !agentName.trim() || loading || adapterEnvLoading
                      }
                      onClick={handleAgentStepNext}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading
                        ? t("onboarding.creating")
                        : t("onboarding.next")}
                    </Button>
                  )}
                  {step === onboardingSteps.task && (
                    <Button
                      size="sm"
                      disabled={!taskTitle.trim() || loading}
                      onClick={handleTaskStepNext}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading
                        ? t("onboarding.creating")
                        : t("onboarding.next")}
                    </Button>
                  )}
                  {step === onboardingSteps.launch && (
                    <Button size="sm" disabled={loading} onClick={handleLaunch}>
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading
                        ? t("onboarding.opening")
                        : t("onboarding.openIssue")}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right half — ASCII art (hidden on mobile) */}
          <div className="hidden md:block w-1/2 overflow-hidden">
            <AsciiArtAnimation />
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}

function AdapterEnvironmentResult({
  result,
}: {
  result: AdapterEnvironmentTestResult;
}) {
  const { t } = useTranslation();
  const statusLabel =
    result.status === "pass"
      ? t("onboarding.passed")
      : result.status === "warn"
      ? t("onboarding.warnings")
      : t("onboarding.failed");
  const statusClass =
    result.status === "pass"
      ? "text-green-700 dark:text-green-300 border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/10"
      : result.status === "warn"
      ? "text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10"
      : "text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10";

  return (
    <div className={`rounded-md border px-2.5 py-2 text-[11px] ${statusClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{statusLabel}</span>
        <span className="opacity-80">
          {new Date(result.testedAt).toLocaleTimeString()}
        </span>
      </div>
      <div className="mt-1.5 space-y-1">
        {result.checks.map((check, idx) => (
          <div
            key={`${check.code}-${idx}`}
            className="leading-relaxed break-words"
          >
            <span className="font-medium uppercase tracking-wide opacity-80">
              {check.level}
            </span>
            <span className="mx-1 opacity-60">·</span>
            <span>{check.message}</span>
            {check.detail && (
              <span className="block opacity-75 break-all">
                ({check.detail})
              </span>
            )}
            {check.hint && (
              <span className="block opacity-90 break-words">
                Hint: {check.hint}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
