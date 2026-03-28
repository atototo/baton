import type { AdapterConfigFieldsProps } from "../types";
import {
  DraftInput,
  Field,
  ToggleField,
  useHelpText,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

export function GeminiLocalConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
  hideInstructionsFile,
}: AdapterConfigFieldsProps) {
  const help = useHelpText();
  const isManaged = !isCreate && String(config?.instructionsBundleMode ?? "") === "managed";

  return (
    <>
      {!hideInstructionsFile && (
        isManaged ? (
          <Field label="Agent instructions file" hint={help.instructionsFilePath}>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>DB에서 관리 중</span>
              <span className="text-xs bg-muted px-2 py-0.5 rounded">managed</span>
            </div>
          </Field>
        ) : (
          <Field label="Agent instructions file" hint={help.instructionsFilePath}>
            <div className="flex items-center gap-2">
              <DraftInput
                value={
                  isCreate
                    ? values!.instructionsFilePath ?? ""
                    : eff(
                        "adapterConfig",
                        "instructionsFilePath",
                        String(config.instructionsFilePath ?? ""),
                      )
                }
                onCommit={(v) =>
                  isCreate
                    ? set!({ instructionsFilePath: v })
                    : mark("adapterConfig", "instructionsFilePath", v || undefined)
                }
                immediate
                className={inputClass}
                placeholder="/absolute/path/to/AGENTS.md"
              />
              <ChoosePathButton />
            </div>
          </Field>
        )
      )}
      <ToggleField
        label="Bypass sandbox"
        hint="Gemini를 샌드박스 제한 없이 실행해 전체 파일시스템과 네트워크에 접근할 수 있게 합니다. 비활성 시 --sandbox 모드로 실행됩니다."
        checked={
          isCreate
            ? values!.dangerouslyBypassSandbox
            : eff("adapterConfig", "sandbox", !!config.sandbox) === false
        }
        onChange={(v) =>
          isCreate
            ? set!({ dangerouslyBypassSandbox: v })
            : mark("adapterConfig", "sandbox", !v)
        }
      />
    </>
  );
}
