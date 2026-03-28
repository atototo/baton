import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "./ui/badge";
import {
  FileText,
  Plus,
  Trash2,
  Save,
  Loader2,
  AlertTriangle,
  FolderOpen,
  Star,
  Upload,
} from "lucide-react";
import type {
  AgentInstructionsBundle,
  AgentInstructionsFileSummary,
} from "@atototo/shared";

interface AgentInstructionsTabProps {
  agentId: string;
  companyId?: string;
}

export function AgentInstructionsTab({ agentId, companyId }: AgentInstructionsTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editDirty, setEditDirty] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [showNewFileInput, setShowNewFileInput] = useState(false);

  const bundleQueryKey = [...queryKeys.agents.detail(agentId), "instructions-bundle"];

  const { data: bundle, isLoading: bundleLoading } = useQuery({
    queryKey: bundleQueryKey,
    queryFn: () => agentsApi.instructionsBundle(agentId, companyId),
  });

  const { data: fileDetail, isLoading: fileLoading } = useQuery({
    queryKey: [...queryKeys.agents.detail(agentId), "instructions-file", selectedFilePath],
    queryFn: () => agentsApi.instructionsFile(agentId, selectedFilePath!, companyId),
    enabled: !!selectedFilePath,
  });

  // When file detail loads, sync content
  useEffect(() => {
    if (fileDetail) {
      setEditContent(fileDetail.content);
      setEditDirty(false);
    }
  }, [fileDetail]);

  // Auto-select entry file on first load
  useEffect(() => {
    if (bundle && !selectedFilePath) {
      const entry = bundle.files.find((f) => f.isEntryFile);
      if (entry) setSelectedFilePath(entry.path);
      else if (bundle.files.length > 0) setSelectedFilePath(bundle.files[0]!.path);
    }
  }, [bundle, selectedFilePath]);

  const invalidateBundle = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: bundleQueryKey });
  }, [queryClient, bundleQueryKey]);

  const saveFile = useMutation({
    mutationFn: (data: { path: string; content: string }) =>
      agentsApi.saveInstructionsFile(agentId, data, companyId),
    onSuccess: () => {
      setEditDirty(false);
      invalidateBundle();
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.agents.detail(agentId), "instructions-file", selectedFilePath],
      });
      pushToast({ tone: "success", title: t("agentInstructions.fileSaved") });
    },
    onError: (err: Error) => {
      pushToast({ tone: "error", title: err.message });
    },
  });

  const deleteFile = useMutation({
    mutationFn: (path: string) => agentsApi.deleteInstructionsFile(agentId, path, companyId),
    onSuccess: () => {
      setSelectedFilePath(null);
      setEditContent("");
      setEditDirty(false);
      invalidateBundle();
      pushToast({ tone: "success", title: t("agentInstructions.fileDeleted") });
    },
    onError: (err: Error) => {
      pushToast({ tone: "error", title: err.message });
    },
  });

  const createFile = useCallback(() => {
    const name = newFileName.trim();
    if (!name) return;
    // Save empty file then select it
    saveFile.mutate(
      { path: name, content: "" },
      {
        onSuccess: () => {
          setSelectedFilePath(name);
          setNewFileName("");
          setShowNewFileInput(false);
        },
      },
    );
  }, [newFileName, saveFile]);

  const handleSave = () => {
    if (!selectedFilePath) return;
    saveFile.mutate({ path: selectedFilePath, content: editContent });
  };

  const handleDelete = () => {
    if (!selectedFilePath) return;
    deleteFile.mutate(selectedFilePath);
  };

  const updateBundle = useMutation({
    mutationFn: (data: { mode?: "managed" | "external"; entryFile?: string; replaceExisting?: boolean }) =>
      agentsApi.updateInstructionsBundle(agentId, data, companyId),
    onSuccess: () => {
      invalidateBundle();
      pushToast({ tone: "success", title: t("agentInstructions.bundleUpdated") });
    },
    onError: (err: Error) => {
      pushToast({ tone: "error", title: err.message });
    },
  });

  const handleSetEntryFile = (path: string) => {
    updateBundle.mutate({ entryFile: path });
  };

  const handleImportFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      for (const file of Array.from(files)) {
        const content = await file.text();
        await agentsApi.saveInstructionsFile(agentId, { path: file.name, content }, companyId);
      }
      invalidateBundle();
      pushToast({ tone: "success", title: t("agentInstructions.filesImported") });
      // Reset input
      e.target.value = "";
    },
    [agentId, companyId, invalidateBundle, pushToast, t],
  );

  const handleSwitchToManaged = () => {
    if (!window.confirm(t("agentInstructions.switchToManagedConfirm"))) return;
    updateBundle.mutate({ mode: "managed", replaceExisting: true });
  };

  const handleCleanManagedBundle = () => {
    if (!window.confirm(t("agentInstructions.cleanManagedConfirm"))) return;
    updateBundle.mutate({ mode: "managed", replaceExisting: true });
  };

  const selectedFile = bundle?.files.find((f) => f.path === selectedFilePath);
  const isEntryFile = selectedFile?.isEntryFile ?? false;

  if (bundleLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!bundle) return null;

  return (
    <div className="space-y-4">
      {/* Mode indicator + warnings */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">
          {bundle.mode === "external"
            ? t("agentInstructions.modeExternal")
            : t("agentInstructions.modeManaged")}
        </Badge>
        {bundle.mode === "external" && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            onClick={handleSwitchToManaged}
            disabled={updateBundle.isPending}
          >
            {updateBundle.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <FolderOpen className="h-3 w-3 mr-1" />
            )}
            {t("agentInstructions.switchToManaged")}
          </Button>
        )}
        {bundle.mode === "managed" && bundle.files.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            onClick={handleCleanManagedBundle}
            disabled={updateBundle.isPending}
          >
            {updateBundle.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Trash2 className="h-3 w-3 mr-1" />
            )}
            {t("agentInstructions.cleanManaged")}
          </Button>
        )}
        {bundle.legacyPromptTemplateActive && (
          <Badge variant="secondary" className="text-amber-600 dark:text-amber-400">
            {t("agentInstructions.legacyPromptActive")}
          </Badge>
        )}
      </div>

      {bundle.warnings.length > 0 && (
        <div className="space-y-1">
          {bundle.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state: no mode configured yet */}
      {!bundle.mode && bundle.files.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 min-h-[28rem]">
          <div className="rounded-full bg-muted p-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">{t("agentInstructions.emptyTitle")}</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {t("agentInstructions.emptyDescription")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => updateBundle.mutate({ mode: "managed" })}
              disabled={updateBundle.isPending}
            >
              {updateBundle.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {t("agentInstructions.createNew")}
            </Button>
            <label>
              <Button variant="outline" asChild>
                <span className="cursor-pointer">
                  <Upload className="h-4 w-4 mr-2" />
                  {t("agentInstructions.importFiles")}
                </span>
              </Button>
              <input
                type="file"
                accept=".md,.txt,.yaml,.yml"
                multiple
                className="hidden"
                onChange={handleImportFiles}
              />
            </label>
          </div>
        </div>
      ) : (
      /* Main layout: sidebar + editor */
      <div className="flex gap-4 min-h-[28rem]">
        {/* File tree sidebar */}
        <div className="w-56 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("agentInstructions.files")}
            </h4>
            {bundle.editable && (
              <div className="flex items-center gap-0.5">
                <button
                  className="p-1 rounded hover:bg-accent transition-colors"
                  onClick={() => setShowNewFileInput(!showNewFileInput)}
                  title={t("agentInstructions.newFile")}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <label
                  className="p-1 rounded hover:bg-accent transition-colors cursor-pointer"
                  title={t("agentInstructions.importFiles")}
                >
                  <Upload className="h-3.5 w-3.5" />
                  <input
                    type="file"
                    accept=".md,.txt,.yaml,.yml"
                    multiple
                    className="hidden"
                    onChange={handleImportFiles}
                  />
                </label>
              </div>
            )}
          </div>

          {showNewFileInput && (
            <div className="flex gap-1">
              <Input
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder={t("agentInstructions.fileNamePlaceholder")}
                className="h-7 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFile();
                  if (e.key === "Escape") {
                    setShowNewFileInput(false);
                    setNewFileName("");
                  }
                }}
                autoFocus
              />
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={createFile}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          )}

          <div className="rounded-lg border border-border overflow-hidden">
            {bundle.files.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <FolderOpen className="h-5 w-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{t("agentInstructions.noFiles")}</p>
              </div>
            ) : (
              bundle.files.map((file) => (
                <FileTreeItem
                  key={file.path}
                  file={file}
                  selected={selectedFilePath === file.path}
                  onClick={() => {
                    if (editDirty && selectedFilePath !== file.path) {
                      // Simple confirmation for unsaved changes
                      if (!window.confirm(t("agentInstructions.unsavedConfirm"))) return;
                    }
                    setSelectedFilePath(file.path);
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedFilePath ? (
            <>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-mono truncate">{selectedFilePath}</span>
                  {isEntryFile ? (
                    <span className="shrink-0" title={t("agentInstructions.entryFile")}>
                      <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                    </span>
                  ) : (
                    bundle.editable && !selectedFile?.deprecated && !selectedFile?.virtual && (
                      <button
                        className="shrink-0 opacity-30 hover:opacity-100 transition-opacity"
                        title={t("agentInstructions.setAsEntryFile")}
                        onClick={() => handleSetEntryFile(selectedFilePath!)}
                        disabled={updateBundle.isPending}
                      >
                        <Star className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )
                  )}
                  {editDirty && (
                    <span className="text-xs text-muted-foreground">({t("agentInstructions.modified")})</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!isEntryFile && bundle.editable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-destructive hover:text-destructive"
                      onClick={handleDelete}
                      disabled={deleteFile.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="h-7"
                    onClick={handleSave}
                    disabled={!editDirty || saveFile.isPending}
                  >
                    {saveFile.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1" />
                    )}
                    {t("agentInstructions.save")}
                  </Button>
                </div>
              </div>

              {fileLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Textarea
                  value={editContent}
                  onChange={(e) => {
                    setEditContent(e.target.value);
                    setEditDirty(true);
                  }}
                  className="flex-1 font-mono text-sm resize-none min-h-[24rem]"
                  readOnly={!bundle.editable}
                  placeholder={t("agentInstructions.editorPlaceholder")}
                />
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("agentInstructions.selectFile")}
              </p>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function FileTreeItem({
  file,
  selected,
  onClick,
}: {
  file: AgentInstructionsFileSummary;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex items-center gap-2 w-full px-3 py-2 text-left text-xs transition-colors hover:bg-accent/50",
        selected && "bg-accent",
      )}
      onClick={onClick}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate font-mono">{file.path}</span>
      {file.isEntryFile && <Star className="h-2.5 w-2.5 shrink-0 text-amber-500" />}
      {file.deprecated && (
        <span className="shrink-0 text-[10px] text-muted-foreground">(deprecated)</span>
      )}
    </button>
  );
}
