import { useState } from "react";
import type { SyncInfo } from "../types";

type CloudPanelProps = {
  open: boolean;
  syncInfo: SyncInfo;
  onClose: () => void;
  onSignUp: (email: string, password: string) => Promise<string>;
  onSignIn: (email: string, password: string) => Promise<string>;
  onSignOut: () => Promise<void>;
  onForceSync: () => Promise<void>;
};

export default function CloudPanel(props: CloudPanelProps) {
  const { open, syncInfo, onClose, onSignUp, onSignIn, onSignOut, onForceSync } = props;
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  if (!open) return null;

  async function handleAuthSubmit() {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setMessage("请输入邮箱和密码。");
      return;
    }

    if (password.length < 6) {
      setMessage("密码至少需要 6 位。");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setMessage("两次输入的密码不一致。");
      return;
    }

    setIsBusy(true);
    try {
      const nextMessage =
        mode === "signup"
          ? await onSignUp(trimmedEmail, password)
          : await onSignIn(trimmedEmail, password);
      setMessage(nextMessage);
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : mode === "signup" ? "注册失败。" : "登录失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOut() {
    setIsBusy(true);
    try {
      await onSignOut();
      setMessage("已退出登录。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "退出失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleForceSync() {
    setIsBusy(true);
    try {
      await onForceSync();
      setMessage("已完成手动同步。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "同步失败。");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="modal-shell" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="账号与同步设置">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Supabase</span>
            <h3>账号与同步</h3>
          </div>
          <button className="ghost-button small" onClick={onClose}>
            关闭
          </button>
        </div>

        {!syncInfo.configured ? (
          <div className="cloud-block">
            <p>还没有配置 Supabase。请先在 `.env.local` 中填入以下变量：</p>
            <code>VITE_SUPABASE_URL</code>
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
          </div>
        ) : syncInfo.userEmail ? (
          <div className="cloud-block">
            <p>已登录：{syncInfo.userEmail}</p>
            <p>{syncInfo.message ?? "云同步已就绪。"}</p>
            <div className="modal-actions">
              <button className="secondary-button" disabled={isBusy} onClick={handleForceSync}>
                立即同步
              </button>
              <button className="secondary-button" disabled={isBusy} onClick={handleSignOut}>
                退出登录
              </button>
            </div>
          </div>
        ) : (
          <div className="cloud-block">
            <div className="auth-switcher" role="tablist" aria-label="认证方式">
              <button
                className={`mode-card ${mode === "signin" ? "selected" : ""}`}
                onClick={() => setMode("signin")}
                type="button"
              >
                <span>登录</span>
                <strong>已有账号</strong>
              </button>
              <button
                className={`mode-card ${mode === "signup" ? "selected" : ""}`}
                onClick={() => setMode("signup")}
                type="button"
              >
                <span>注册</span>
                <strong>新建账号</strong>
              </button>
            </div>

            <p>{mode === "signup" ? "创建一个邮箱密码账号。" : "输入邮箱和密码直接登录。"}</p>
            <input
              className="text-input"
              type="email"
              placeholder="name@example.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <input
              className="text-input"
              type="password"
              placeholder="至少 6 位密码"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            {mode === "signup" ? (
              <input
                className="text-input"
                type="password"
                placeholder="再次输入密码"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            ) : null}

            <p className="modal-message">如果注册后仍提示要确认邮箱，请到 Supabase Dashboard 关闭 `Confirm email`。</p>

            <div className="modal-actions">
              <button className="primary-button" disabled={isBusy} onClick={handleAuthSubmit}>
                {isBusy ? "处理中..." : mode === "signup" ? "注册并登录" : "登录"}
              </button>
            </div>
          </div>
        )}

        {message ? <p className="modal-message">{message}</p> : null}
      </div>
    </div>
  );
}
