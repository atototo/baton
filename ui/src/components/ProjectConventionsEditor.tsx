import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "./ui/badge";
import { Loader2, Sparkles, Save } from "lucide-react";

interface ProjectConventionsEditorProps {
  projectId: string;
  companyId?: string;
}

export function ProjectConventionsEditor({ projectId, companyId }: ProjectConventionsEditorProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [backstory, setBackstory] = useState("");
  const [conventionsMd, setConventionsMd] = useState("");
  const [dirty, setDirty] = useState(false);

  const conventionsQueryKey = queryKeys.projects.conventions(projectId);

  const { data: conventions, isLoading } = useQuery({
    queryKey: conventionsQueryKey,
    queryFn: () => projectsApi.getConventions(projectId, companyId),
  });

  useEffect(() => {
    if (conventions) {
      setBackstory(conventions.backstory ?? "");
      setConventionsMd(conventions.conventionsMd ?? "");
      setDirty(false);
    }
  }, [conventions]);

  const saveConventions = useMutation({
    mutationFn: () =>
      projectsApi.saveConventions(projectId, { backstory, conventionsMd }, companyId),
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: conventionsQueryKey });
      pushToast({ tone: "success", title: t("projectConventions.saved") });
    },
    onError: (err: Error) => {
      pushToast({ tone: "error", title: err.message });
    },
  });

  const generateCompact = useMutation({
    mutationFn: () => projectsApi.generateCompactContext(projectId, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conventionsQueryKey });
      pushToast({ tone: "success", title: t("projectConventions.compactGenerated") });
    },
    onError: (err: Error) => {
      pushToast({ tone: "error", title: err.message });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Backstory */}
      <section className="space-y-2">
        <label className="text-sm font-medium">{t("projectConventions.backstory")}</label>
        <p className="text-xs text-muted-foreground">{t("projectConventions.backstoryDescription")}</p>
        <Textarea
          value={backstory}
          onChange={(e) => {
            setBackstory(e.target.value);
            setDirty(true);
          }}
          placeholder={t("projectConventions.backstoryPlaceholder")}
          className="min-h-[6rem]"
        />
      </section>

      {/* Conventions markdown */}
      <section className="space-y-2">
        <label className="text-sm font-medium">{t("projectConventions.conventions")}</label>
        <p className="text-xs text-muted-foreground">{t("projectConventions.conventionsDescription")}</p>
        <Textarea
          value={conventionsMd}
          onChange={(e) => {
            setConventionsMd(e.target.value);
            setDirty(true);
          }}
          placeholder={t("projectConventions.conventionsPlaceholder")}
          className="min-h-[12rem] font-mono text-sm"
        />
      </section>

      {/* Compact context (read-only) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium">{t("projectConventions.compactContext")}</label>
            <p className="text-xs text-muted-foreground">{t("projectConventions.compactContextDescription")}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateCompact.mutate()}
            disabled={generateCompact.isPending}
          >
            {generateCompact.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1" />
            )}
            {t("projectConventions.generateCompact")}
          </Button>
        </div>
        {conventions?.compactContext ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-mono">
              {conventions.compactContext}
            </pre>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <p className="text-xs text-muted-foreground">{t("projectConventions.noCompactContext")}</p>
          </div>
        )}
      </section>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <Button onClick={() => saveConventions.mutate()} disabled={!dirty || saveConventions.isPending}>
          {saveConventions.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1" />
          )}
          {t("projectConventions.save")}
        </Button>
        {dirty && (
          <Badge variant="secondary" className="text-amber-600 dark:text-amber-400">
            {t("projectConventions.unsavedChanges")}
          </Badge>
        )}
      </div>
    </div>
  );
}
