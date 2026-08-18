import logoUrl from "../assets/dscope-logo.png";
import type { CreatorProfile, Screen, WalletConnection } from "../model";
import { shortHash } from "../model";
import { PUBLIC_ENABLE_ADMIN, PUBLIC_ENABLE_DEV_MODE } from "../publicConfig";

type NavItem = {
  screen: Screen;
  label: string;
  icon: string;
};

const primaryNav: NavItem[] = [
  {
    screen: "home",
    label: "Overview",
    icon: "⌂",
  },
  {
    screen: "explore",
    label: "Explorer",
    icon: "◌",
  },
  {
    screen: "activity",
    label: "My Activity",
    icon: "✓",
  },
];

function isCreatorScreen(screen: Screen): boolean {
  return (
    screen === "creatorAccess" ||
    screen === "creatorWorkspace" ||
    screen === "builder"
  );
}

function navButtonClass(active: boolean): string {
  return active ? "sidebar-nav-item active" : "sidebar-nav-item";
}

export function Header({
  screen,
  setScreen,
  creator,
  onOpenCreatorStudio,
  wallet,
  onUseLocalWallet,
  onConnectAzguardWallet,
  onDisconnectWallet,
  walletConnecting,
}: {
  screen: Screen;
  setScreen: (screen: Screen) => void;
  creator: CreatorProfile | null;
  onOpenCreatorStudio: () => void;
  wallet: WalletConnection;
  onUseLocalWallet: () => void;
  onConnectAzguardWallet: () => void;
  onDisconnectWallet: () => void;
  walletConnecting: boolean;
}) {
  const creatorScreenActive = isCreatorScreen(screen);

  return (
    <>
      <aside className="app-sidebar" aria-label="D-Scope navigation">
        <div className="sidebar-top">
          <button
            className="sidebar-brand"
            type="button"
            onClick={() => setScreen("home")}
            aria-label="Open D-Scope overview"
          >
            <img className="brand-logo" src={logoUrl} alt="D-Scope" />
            <span>
              <strong>D-Scope</strong>
              <em>Private research</em>
            </span>
          </button>

          <nav className="sidebar-nav" aria-label="Main navigation">
            {primaryNav.map((item) => (
              <button
                key={item.screen}
                type="button"
                className={navButtonClass(screen === item.screen)}
                onClick={() => setScreen(item.screen)}
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="nav-copy">
                  <strong>{item.label}</strong>
                </span>
              </button>
            ))}

            <button
              type="button"
              className={navButtonClass(creatorScreenActive)}
              onClick={onOpenCreatorStudio}
            >
              <span className="nav-icon" aria-hidden="true">
                ▣
              </span>
              <span className="nav-copy">
                <strong>Creator Studio</strong>
              </span>
            </button>
          </nav>
        </div>

        <div className="sidebar-context">
          <div className="context-card signal-card">
            <span className="eyebrow">Network</span>
            <strong>
              <span className="context-dot" aria-hidden="true" /> Aztec Testnet
            </strong>
            <small>Public testing environment</small>
          </div>

          <div className="context-card wallet-card">
            <span className="eyebrow">Wallet</span>
            <strong>
              {wallet.connected
                ? shortHash(wallet.participantRef)
                : "Not connected"}
            </strong>
            <small>
              {wallet.connected
                ? wallet.label
                : "Compatible wallet required for respondent actions."}
            </small>

            {wallet.connected ? (
              <button
                className="secondary-btn sidebar-action"
                type="button"
                onClick={onDisconnectWallet}
              >
                Disconnect
              </button>
            ) : (
              <div className="sidebar-wallet-actions">
                <button
                  className="primary-btn sidebar-action"
                  type="button"
                  onClick={onConnectAzguardWallet}
                  disabled={walletConnecting}
                >
                  {walletConnecting ? "Connecting..." : "Connect Azguard"}
                </button>
                {PUBLIC_ENABLE_DEV_MODE && (
                  <button
                    className="ghost-btn sidebar-action"
                    type="button"
                    onClick={onUseLocalWallet}
                  >
                    Use dev
                  </button>
                )}
              </div>
            )}
          </div>

          {PUBLIC_ENABLE_ADMIN && (
            <button
              className="admin-mini-link"
              type="button"
              onClick={() => setScreen("admin")}
            >
              Operator tools
            </button>
          )}
        </div>
      </aside>

      <header className="mobile-appbar">
        <button
          className="mobile-brand"
          type="button"
          onClick={() => setScreen("home")}
        >
          <img className="brand-logo" src={logoUrl} alt="D-Scope" />
          <span>D-Scope</span>
        </button>
        <button
          className="secondary-btn"
          type="button"
          onClick={onOpenCreatorStudio}
        >
          Studio
        </button>
      </header>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <button
          type="button"
          className={screen === "home" ? "active" : ""}
          onClick={() => setScreen("home")}
        >
          <span aria-hidden="true">⌂</span>
          Overview
        </button>
        <button
          type="button"
          className={screen === "explore" ? "active" : ""}
          onClick={() => setScreen("explore")}
        >
          <span aria-hidden="true">◌</span>
          Explore
        </button>
        <button
          type="button"
          className={screen === "activity" ? "active" : ""}
          onClick={() => setScreen("activity")}
        >
          <span aria-hidden="true">✓</span>
          Activity
        </button>
        <button
          type="button"
          className={creatorScreenActive ? "active" : ""}
          onClick={onOpenCreatorStudio}
        >
          <span aria-hidden="true">▣</span>
          Studio
        </button>
      </nav>
    </>
  );
}
