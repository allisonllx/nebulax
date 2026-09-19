import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import type { Language } from "./journey";
const catalogSchema = z.object({
  active: z.string().nullable(),
  scenarios: z.array(
    z.object({
      name: z.string(),
      title: z.object({ en: z.string(), zh: z.string() }),
    }),
  ),
});
async function scenarioRequest(path = "", method = "GET") {
  const response = await fetch(`/api/scenarios${path}`, {
    method,
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw new Error(`Scenario request failed (${response.status})`);
  return response.json();
}
export function PresentationDemo({
  language,
  busy,
  offline,
  simulatedOffline,
  hasJourney,
  onOffline,
  onPrepare,
  onCheck,
  onActive,
}: {
  language: Language;
  busy: boolean;
  offline: boolean;
  simulatedOffline: boolean;
  hasJourney: boolean;
  onOffline: () => void;
  onPrepare: () => Promise<void>;
  onCheck: () => Promise<void>;
  onActive: (name: string | null) => void;
}) {
  const [catalog, setCatalog] = useState<z.infer<typeof catalogSchema> | null>(
    null,
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const t = (en: string, zh: string) => (language === "zh" ? zh : en);
  const receiveCatalog = useCallback(
    (value: unknown) => {
      const next = catalogSchema.parse(value);
      setCatalog(next);
      onActive(next.active);
    },
    [onActive],
  );
  async function load() {
    receiveCatalog(await scenarioRequest());
  }
  useEffect(() => {
    let mounted = true;
    scenarioRequest()
      .then((value) => {
        if (mounted) receiveCatalog(value);
      })
      .catch(() => {
        if (mounted) setError("load");
      });
    return () => {
      mounted = false;
    };
  }, [receiveCatalog]);
  async function run(action: "prepare" | "activate" | "deactivate" | "reload") {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      if (action === "reload") await load();
      else if (action === "activate") {
        const result = z
          .object({ active: z.string() })
          .parse(await scenarioRequest("/hard_for_him/activate", "POST"));
        onActive(result.active);
        setCatalog((c) => c && { ...c, active: result.active });
        await onCheck();
      } else {
        await scenarioRequest("/deactivate", "POST");
        onActive(null);
        setCatalog((c) => c && { ...c, active: null });
        if (action === "prepare") {
          await onPrepare();
          setMessage("ready");
        } else setMessage("live");
      }
    } catch {
      setError(action);
    } finally {
      setWorking(false);
    }
  }
  const disabled = busy || working || offline;
  const available = catalog?.scenarios.some((s) => s.name === "hard_for_him");
  return (
    <details className="presentation-demo">
      <summary>{t("Presentation demo", "演示控制台")}</summary>
      <p>
        {t(
          "Show the usual route, then see it change when the lift is unavailable and the platform is crowded.",
          "先看原路线，再模拟电梯维修和站台拥挤，查看更新后的路线。",
        )}
      </p>
      <div className="scenario-buttons">
        <button
          className="secondary"
          disabled={disabled || !catalog}
          onClick={() => void run("prepare")}
        >
          {t("1. Show original route", "1. 显示原路线")}
        </button>
        <button
          className="primary"
          disabled={disabled || !hasJourney || !available}
          onClick={() => void run("activate")}
        >
          {t("2. Lift outage + crowded platform", "2. 模拟电梯维修 + 站台拥挤")}
        </button>
      </div>
      <p role="status">
        {working
          ? t("Updating the journey…", "正在更新行程…")
          : catalog?.active
            ? t("Simulated disruption is on", "模拟故障已开启")
            : catalog
              ? t("Ready to show the original route", "可显示原路线")
              : t("Scenario status unavailable", "暂时无法获取情景状态")}
      </p>
      <details>
        <summary>{t("Other demo controls", "其他演示选项")}</summary>
        <p>
          {t(
            "The original-route button replaces this device’s saved journey with the AMK → TTSH example. Simulation affects everyone on this backend and needs internet access.",
            "显示原路线会将本机行程替换为宏茂桥至陈笃生医院示例。模拟会影响连接此服务的所有用户，并需要网络。",
          )}
        </p>
        <div className="scenario-buttons">
          <button
            className="secondary"
            disabled={disabled || !catalog}
            onClick={() => void run("deactivate")}
          >
            {t("Return to live conditions", "恢复实时状况")}
          </button>
          <button
            className="secondary"
            disabled={busy || working || !hasJourney}
            aria-pressed={simulatedOffline}
            onClick={onOffline}
          >
            {simulatedOffline
              ? t("Restore connection", "恢复连接")
              : t("Simulate offline", "模拟离线")}
          </button>
        </div>
        <p>
          {t(
            "Returning to live conditions keeps the saved route. Use step 1 to restart. Offline simulation pauses updates without disconnecting the device.",
            "恢复实时状况会保留保存的路线。重新演示请点第1步。离线模拟只暂停更新，不会断开设备网络。",
          )}
        </p>
      </details>
      {message === "live" && (
        <p role="status">
          {t(
            "Simulation is off; the saved route is unchanged.",
            "模拟已关闭，保存的路线未改变。",
          )}
        </p>
      )}
      {error && (
        <div role="alert">
          <p>
            {t(
              "Could not complete the demo action. Your saved route is still available. Retry, or turn off the simulation under Other demo controls.",
              "无法完成演示操作，保存的路线仍可查看。请重试，或在其他演示选项中关闭模拟。",
            )}
          </p>
          <button
            className="secondary"
            disabled={disabled}
            onClick={() => void run("reload")}
          >
            {t("Reload scenario status", "重新获取情景状态")}
          </button>
        </div>
      )}
    </details>
  );
}
