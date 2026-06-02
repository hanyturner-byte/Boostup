import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  increment,
  serverTimestamp,
} from "firebase/firestore";

// ── Firebase Config ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── Task pool ────────────────────────────────────────────────────────────────
const TASK_POOL = [
  { id: 1, type: "follow", platform: "tiktok", username: "adrianasousasss5", avatar: "https://i.pravatar.cc/150?img=47", reward: 5 },
  { id: 2, type: "like", platform: "tiktok", username: "andretyson90", avatar: "https://i.pravatar.cc/150?img=12", reward: 3 },
  { id: 3, type: "follow", platform: "instagram", username: "patrick.schmiedi", avatar: "https://i.pravatar.cc/150?img=33", reward: 5 },
  { id: 4, type: "like", platform: "instagram", username: "xo.luna.xo", avatar: "https://i.pravatar.cc/150?img=25", reward: 3 },
  { id: 5, type: "follow", platform: "tiktok", username: "danceking_jay", avatar: "https://i.pravatar.cc/150?img=56", reward: 5 },
];

const STORE_ITEMS = {
  profile: [
    { id: "p1", label: "+200 Followers", coins: 100, icon: "👤" },
    { id: "p2", label: "+400 Followers", coins: 180, icon: "👤" },
    { id: "p3", label: "+900 Followers", coins: 380, icon: "👤" },
    { id: "p4", label: "+2000 Followers", coins: 800, icon: "👤" },
  ],
  video: [
    { id: "v1", label: "+300 Likes", coins: 90, icon: "❤️" },
    { id: "v2", label: "+600 Likes", coins: 170, icon: "❤️" },
    { id: "v3", label: "+1400 Likes", coins: 380, icon: "❤️" },
    { id: "v4", label: "+3000 Likes", coins: 800, icon: "❤️" },
  ],
};

const REPORT_REASONS = [
  "Adult or sexual content",
  "Scam, spam, or impersonations",
  "Private, unavailable, or not accessible",
  "Coins not received",
  "Other issue",
];

const FAQ_DATA = [
  { q: "How do I get started?", a: "Enter your TikTok or Instagram username to start earning coins by following or liking content. No password required." },
  { q: "How can I earn coins?", a: "Complete tasks by following or liking accounts. You must wait 30 seconds before earning coins. Max 15 tasks per day." },
  { q: "What's the mechanism?", a: "Your profile is promoted in our app. Users follow/like you and earn coins. You use coins to promote your own content." },
  { q: "Is it secure?", a: "Yes. We never store passwords and direct you to the official app to follow/like." },
  { q: "How long does my order take?", a: "2 minutes to 12 hours depending on order size." },
];

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("onboard");
  const [storeTab, setStoreTab] = useState("profile");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(null);
  const [taskDone, setTaskDone] = useState(false);
  const [timer, setTimer] = useState(30);
  const [timerRunning, setTimerRunning] = useState(false);
  const [toast, setToast] = useState(null);
  const [coinAnim, setCoinAnim] = useState(false);
  const toastRef = useRef(null);
  const timerRef = useRef(null);

  // ── Auth & load user data ────────────────────────────────────────────────────
  useEffect(() => {
    onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setUser(fbUser);
        const userRef = doc(db, "users", fbUser.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          setUserData(snap.data());
          setPage("home");
        } else {
          setUserData({ coins: 0, orders: [], referrals: [] });
          setPage("onboard");
        }
      } else {
        await signInAnonymously(auth);
      }
      setLoading(false);
    });
  }, []);

  // ── Timer countdown ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!timerRunning) return;
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          setTimerRunning(false);
          return 30;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [timerRunning]);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2800);
  }

  function addCoins(amount) {
    setCoinAnim(true);
    setTimeout(() => setCoinAnim(false), 700);
    setUserData(u => ({ ...u, coins: u.coins + amount }));
    updateDoc(doc(db, "users", user.uid), { coins: increment(amount) }).catch(() => {});
  }

  // ── Onboarding ──────────────────────────────────────────────────────────────
  const [inputUser, setInputUser] = useState("");

  async function handleOnboard() {
    if (!inputUser.trim()) return;
    const cleanUser = inputUser.trim().replace("@", "");
    const uid = user.uid;
    const refCode = `REF${uid.slice(0, 8).toUpperCase()}`;

    const newUserData = {
      username: cleanUser,
      coins: 200,
      createdAt: serverTimestamp(),
      lastDailyReset: new Date().toDateString(),
      tasksCompletedToday: 0,
      referralCode: refCode,
      referredBy: null,
      referrals: [],
    };

    await setDoc(doc(db, "users", uid), newUserData);
    setUserData(newUserData);
    setPage("home");
    showToast("Welcome! 🎉");
  }

  // ── Current task ────────────────────────────────────────────────────────────
  if (!userData) return loading ? <div style={styles.loading}>Loading...</div> : null;

  const currentTask = TASK_POOL[Math.floor(Math.random() * TASK_POOL.length)];

  function handleFollow() {
    const task = currentTask;
    const url = task.platform === "tiktok"
      ? `https://www.tiktok.com/@${task.username}`
      : `https://www.instagram.com/${task.username}`;
    window.open(url, "_blank");
    setTaskDone(true);
    setTimer(30);
    setTimerRunning(true);
  }

  async function handleTaskConfirm() {
    const today = new Date().toDateString();
    let tasksToday = userData.tasksCompletedToday || 0;
    if (userData.lastDailyReset !== today) {
      tasksToday = 0;
    }

    if (tasksToday >= 15) {
      showToast("Daily task limit (15) reached ❌", "error");
      return;
    }

    const task = currentTask;
    addCoins(task.reward);

    const updatedData = {
      ...userData,
      tasksCompletedToday: tasksToday + 1,
      lastDailyReset: today,
    };
    setUserData(updatedData);

    await updateDoc(doc(db, "users", user.uid), {
      coins: increment(task.reward),
      tasksCompletedToday: tasksToday + 1,
      lastDailyReset: today,
    }).catch(() => {});

    setTaskDone(false);
    setTimerRunning(false);
    showToast(`+${task.reward} coins! ⭐`);
  }

  function handleSkip() {
    setTaskDone(false);
    setTimerRunning(false);
  }

  async function handleReport() {
    setReportOpen(false);
    showToast("Report submitted ✓");
    setTaskDone(false);
    setTimerRunning(false);
  }

  // ── Store purchase ──────────────────────────────────────────────────────────
  async function handleBuyCoin(item) {
    if (userData.coins < item.coins) {
      showToast("Not enough coins ❌", "error");
      return;
    }

    const newCoins = userData.coins - item.coins;
    setUserData(u => ({ ...u, coins: newCoins }));
    await updateDoc(doc(db, "users", user.uid), { coins: newCoins }).catch(() => {});

    const orderId = Date.now();
    const order = {
      id: orderId,
      label: item.label,
      cost: item.coins,
      currency: "coins",
      status: "Active",
      date: new Date().toLocaleString().slice(0, 16),
    };

    setUserData(u => ({ ...u, orders: [order, ...(u.orders || [])] }));
    await updateDoc(doc(db, "users", user.uid), {
      orders: [order, ...(userData.orders || [])],
    }).catch(() => {});

    showToast(`Order placed! ${item.label} ✅`);

    setTimeout(() => {
      setUserData(u => ({
        ...u,
        orders: u.orders.map(o => o.id === orderId ? { ...o, status: "Completed" } : o),
      }));
    }, 4000);
  }

  // ── Referral ────────────────────────────────────────────────────────────────
  const referralLink = `${window.location.origin}?ref=${userData.referralCode}`;

  function handleCopyRef() {
    navigator.clipboard.writeText(referralLink).catch(() => {});
    showToast("Referral link copied! 🔗");
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      <style>{css}</style>

      {toast && (
        <div style={{ ...styles.toast, background: toast.type === "error" ? "#e5214a" : "#1ed760" }}>
          {toast.msg}
        </div>
      )}

      {/* Report modal */}
      {reportOpen && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ color: "#fff", margin: 0 }}>Report the task</h3>
              <button style={styles.closeBtn} onClick={() => setReportOpen(false)}>✕</button>
            </div>
            {REPORT_REASONS.map(r => (
              <div key={r} style={styles.radioRow} onClick={() => setReportReason(r)}>
                <div style={{ ...styles.radio, ...(reportReason === r ? { background: "#ff3c6e", borderColor: "#ff3c6e" } : {}) }} />
                <span style={{ color: "#ccd", fontSize: 14 }}>{r}</span>
              </div>
            ))}
            <button style={{ ...styles.btnPink, marginTop: 20 }} onClick={() => reportReason && handleReport()}>SUBMIT</button>
          </div>
        </div>
      )}

      {/* ── ONBOARDING ─────────────────────────────────────────── */}
      {page === "onboard" && (
        <div style={styles.onboard}>
          <div style={styles.logoGlow}>
            <span style={styles.logoText}>⚡BoostUp</span>
          </div>
          <p style={styles.onboardSub}>Grow your TikTok & Instagram.<br />Earn real coins. Get followers.</p>
          <div style={styles.inputWrap}>
            <span style={styles.inputAt}>@</span>
            <input
              style={styles.input}
              placeholder="your username"
              value={inputUser}
              onChange={e => setInputUser(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleOnboard()}
            />
          </div>
          <button style={styles.btnPink} onClick={handleOnboard}>Get Started →</button>
          <p style={styles.onboardNote}>No password required. 100% safe.</p>
        </div>
      )}

      {/* ── MAIN APP ───────────────────────────────────── */}
      {page !== "onboard" && (
        <div style={styles.appWrap}>
          <header style={styles.header}>
            {(page === "orders" || page === "manageAccount" || page === "language" || page === "refer" || page === "faq") ? (
              <button style={styles.backBtn} onClick={() => setPage("more")}>‹</button>
            ) : (
              <div style={styles.avatar}>⚡</div>
            )}
            <span style={styles.headerTitle}>
              {page === "home" ? "BoostUp" : page === "store" ? "Store" : page === "more" ? "Settings" : page === "orders" ? "Orders" : page === "manageAccount" ? "Account" : page === "language" ? "Language" : page === "refer" ? "Refer" : "FAQ"}
            </span>
            <div style={{ ...styles.coinBadge, ...(coinAnim ? styles.coinBounce : {}) }}>
              ⭐ {userData.coins}
            </div>
          </header>

          {/* ── HOME ── */}
          {page === "home" && (
            <div style={styles.pageContent}>
              {taskDone ? (
                <div style={styles.taskConfirmCard}>
                  <p style={{ color: "#aac", marginBottom: 12, fontSize: 14 }}>
                    {timerRunning ? `Wait ${timer}s before claiming...` : "Did you complete the task?"}
                  </p>
                  {timerRunning && (
                    <div style={styles.timerDisplay}>{timer}s</div>
                  )}
                  <div style={styles.taskAvatar}>
                    <img src={currentTask.avatar} alt="" style={styles.taskAvatarImg} />
                  </div>
                  <p style={{ color: "#fff", fontWeight: 700, marginBottom: 20 }}>@{currentTask.username}</p>
                  <button
                    style={{ ...styles.btnPink, ...(timerRunning ? styles.btnDisabled : {}) }}
                    onClick={handleTaskConfirm}
                    disabled={timerRunning}
                  >
                    {timerRunning ? "Wait..." : `Yes! +${currentTask.reward} ⭐`}
                  </button>
                  <button style={{ ...styles.btnGhost, marginTop: 10 }} onClick={handleSkip}>Back</button>
                </div>
              ) : (
                <>
                  <div style={styles.reportIconWrap}>
                    <button style={styles.reportIcon} onClick={() => setReportOpen(true)}>⚑</button>
                  </div>
                  <div style={styles.taskCard}>
                    <div style={styles.taskAvatarWrap}>
                      <div style={styles.circleGlow}>
                        <img src={currentTask.avatar} alt="" style={styles.taskAvatarLarge} />
                      </div>
                    </div>
                    <p style={styles.taskUsername}>@{currentTask.username}</p>
                    <div style={styles.platformBadge}>
                      {currentTask.platform === "tiktok" ? "🎵 TikTok" : "📸 Instagram"}
                    </div>
                  </div>
                  <div style={styles.taskActions}>
                    <button style={styles.btnSkip} onClick={() => setTaskDone(false)}>Skip</button>
                    <button style={styles.btnAction} onClick={handleFollow}>
                      {currentTask.type === "follow" ? "Follow" : "Like"} +{currentTask.reward} ⭐
                    </button>
                  </div>
                  <div style={styles.warningBox}>
                    ⏱️ 30 second timer before coins. Max 15 tasks/day.
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── STORE ── */}
          {page === "store" && (
            <div style={styles.pageContent}>
              <div style={styles.tabRow}>
                <button style={{ ...styles.tab, ...(storeTab === "profile" ? styles.tabActive : {}) }} onClick={() => setStoreTab("profile")}>Profile</button>
                <button style={{ ...styles.tab, ...(storeTab === "video" ? styles.tabActive : {}) }} onClick={() => setStoreTab("video")}>Video</button>
              </div>
              <div style={styles.storeList}>
                {STORE_ITEMS[storeTab].map(item => (
                  <div key={item.id} style={styles.storeRow}>
                    <span style={{ fontSize: 22, marginRight: 10 }}>{item.icon}</span>
                    <span style={styles.storeLabel}>{item.label}</span>
                    <button style={styles.btnCoinSm} onClick={() => handleBuyCoin(item)}>
                      {item.coins} ⭐
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── MORE / SETTINGS ── */}
          {page === "more" && (
            <div style={styles.pageContent}>
              <div style={styles.settingsGroup}>
                <button style={styles.settingsRow} onClick={() => setPage("manageAccount")}>
                  <span>Manage Account</span><span style={styles.chevron}>›</span>
                </button>
                <button style={styles.settingsRow} onClick={() => setPage("orders")}>
                  <span>Orders</span><span style={styles.chevron}>›</span>
                </button>
              </div>
              <div style={styles.settingsGroup}>
                <button style={styles.settingsRow} onClick={() => setPage("refer")}>
                  <span>Refer & get +200 ⭐</span><span style={styles.chevron}>›</span>
                </button>
                <button style={styles.settingsRow} onClick={() => setPage("language")}>
                  <span>Language</span><span style={styles.chevron}>›</span>
                </button>
                <button style={styles.settingsRow} onClick={() => setPage("faq")}>
                  <span>FAQ</span><span style={styles.chevron}>›</span>
                </button>
              </div>
            </div>
          )}

          {/* ── ORDERS ── */}
          {page === "orders" && (
            <div style={styles.pageContent}>
              {(userData.orders || []).length === 0 ? (
                <p style={{ color: "#556", textAlign: "center", marginTop: 40 }}>No orders yet</p>
              ) : (
                (userData.orders || []).map(o => (
                  <div key={o.id} style={styles.orderRow}>
                    <div style={styles.orderIcon}>📦</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: "#fff", margin: 0, fontWeight: 600, fontSize: 14 }}>{o.label}</p>
                      <p style={{ color: "#556", margin: 0, fontSize: 12 }}>{o.date}</p>
                    </div>
                    <span style={{ color: o.status === "Completed" ? "#4ddfaa" : "#ffca28", fontWeight: 700, fontSize: 13 }}>
                      {o.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── MANAGE ACCOUNT ── */}
          {page === "manageAccount" && (
            <div style={styles.pageContent}>
              <div style={styles.card}>
                <span style={{ color: "#fff", fontWeight: 600 }}>Profile</span>
              </div>
              <div style={{ ...styles.card, marginTop: 12, alignItems: "center" }}>
                <div style={styles.acctAvatar}>⚡</div>
                <span style={{ color: "#fff", flex: 1, marginLeft: 12 }}>@{userData.username}</span>
                <span style={{ color: "#4ddfaa", fontSize: 20 }}>✓</span>
              </div>
              <p style={{ color: "#778", fontSize: 13, marginTop: 16 }}>
                Referral Code: <span style={{ color: "#ff3c6e", fontWeight: 700 }}>{userData.referralCode}</span>
              </p>
            </div>
          )}

          {/* ── LANGUAGE ── */}
          {page === "language" && (
            <div style={styles.pageContent}>
              {["English", "Español", "Deutsch", "Français"].map((lang, i) => (
                <div key={lang} style={styles.langRow}>
                  <span style={{ color: "#ccd" }}>{lang}</span>
                  <div style={{ ...styles.radio, ...(i === 0 ? { background: "#ff3c6e", borderColor: "#ff3c6e" } : {}) }} />
                </div>
              ))}
            </div>
          )}

          {/* ── REFER ── */}
          {page === "refer" && (
            <div style={styles.pageContent}>
              <div style={styles.referCard}>
                <h2 style={{ color: "#fff", fontSize: 20, marginBottom: 8 }}>Invite friends & Earn 200 coins per person.</h2>
                <p style={{ color: "#778", fontSize: 13, marginBottom: 20 }}>Reward credited once they sign up using your link.</p>
                <div style={styles.linkBox}>
                  <span style={{ color: "#aac", fontSize: 12, flex: 1, wordBreak: "break-all" }}>{referralLink}</span>
                  <button style={styles.copyBtn} onClick={handleCopyRef}>⧉</button>
                </div>
                <button style={{ ...styles.btnPink, marginTop: 16 }} onClick={handleCopyRef}>Share Link</button>
                <div style={styles.referStats}>
                  <p style={{ color: "#aac", fontSize: 13, margin: 0 }}>Referrals: <strong style={{ color: "#fff" }}>{(userData.referrals || []).length}</strong></p>
                </div>
              </div>
            </div>
          )}

          {/* ── FAQ ── */}
          {page === "faq" && (
            <div style={styles.pageContent}>
              {FAQ_DATA.map((item, i) => <FaqItem key={i} q={item.q} a={item.a} />)}
            </div>
          )}

          {/* ── Bottom Nav ── */}
          <nav style={styles.bottomNav}>
            <button style={{ ...styles.navBtn, ...(page === "home" ? styles.navActive : {}) }} onClick={() => setPage("home")}>
              <span style={styles.navIcon}>🏠</span><span>Home</span>
            </button>
            <button style={{ ...styles.navBtn, ...(page === "store" ? styles.navActive : {}) }} onClick={() => setPage("store")}>
              <span style={styles.navIcon}>🛍️</span><span>Store</span>
            </button>
            <button style={{ ...styles.navBtn, ...(page === "more" ? styles.navActive : {}) }} onClick={() => setPage("more")}>
              <span style={styles.navIcon}>⚙️</span><span>More</span>
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={styles.faqItem}>
      <button style={styles.faqQ} onClick={() => setOpen(o => !o)}>
        <span>{q}</span>
        <span style={{ color: "#ff3c6e" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <p style={styles.faqA}>{a}</p>}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    minHeight: "100vh",
    background: "#060d1e",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    fontFamily: "'Nunito', 'Segoe UI', sans-serif",
  },
  appWrap: {
    width: "100%",
    maxWidth: 430,
    minHeight: "100vh",
    background: "linear-gradient(160deg, #0a1428 0%, #060d1e 100%)",
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 16px 10px",
    borderBottom: "1px solid #0e1e35",
  },
  avatar: {
    width: 40, height: 40,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #ff3c6e, #5b8dff)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 18,
  },
  acctAvatar: {
    width: 40, height: 40,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #ff3c6e, #5b8dff)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 20,
  },
  headerTitle: {
    color: "#fff",
    fontWeight: 800,
    fontSize: 18,
    letterSpacing: 0.5,
  },
  coinBadge: {
    background: "#1a2540",
    borderRadius: 20,
    padding: "6px 12px",
    color: "#ffd700",
    fontWeight: 800,
    fontSize: 15,
    transition: "transform 0.2s",
  },
  coinBounce: { transform: "scale(1.3)" },
  backBtn: {
    background: "none", border: "none",
    color: "#fff", fontSize: 28, cursor: "pointer", padding: "0 8px",
  },
  pageContent: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    paddingBottom: 80,
  },
  bottomNav: {
    position: "sticky",
    bottom: 0,
    display: "flex",
    background: "#0a1428",
    borderTop: "1px solid #0e1e35",
    padding: "8px 0 4px",
  },
  navBtn: {
    flex: 1,
    display: "flex", flexDirection: "column", alignItems: "center",
    background: "none", border: "none",
    color: "#556", fontSize: 11, cursor: "pointer",
    gap: 2,
  },
  navActive: { color: "#ff3c6e" },
  navIcon: { fontSize: 20 },
  onboard: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    width: "100%",
    maxWidth: 430,
    padding: "0 24px",
    gap: 16,
  },
  logoGlow: {
    background: "radial-gradient(ellipse at center, rgba(255,60,110,0.25) 0%, transparent 70%)",
    padding: "40px 20px 20px",
  },
  logoText: {
    fontSize: 42, fontWeight: 900, letterSpacing: -1,
    background: "linear-gradient(90deg, #ff3c6e, #5b8dff)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
  },
  onboardSub: {
    color: "#778", textAlign: "center", fontSize: 15, lineHeight: 1.6, margin: 0,
  },
  inputWrap: {
    display: "flex", alignItems: "center",
    background: "#0e1a30", border: "1px solid #1a2e50",
    borderRadius: 14, padding: "12px 16px",
    width: "100%",
  },
  inputAt: { color: "#ff3c6e", fontWeight: 700, fontSize: 18, marginRight: 6 },
  input: {
    background: "none", border: "none", outline: "none",
    color: "#fff", fontSize: 16, flex: 1,
  },
  onboardNote: { color: "#334", fontSize: 12, margin: 0 },
  taskCard: {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "30px 20px 20px",
  },
  taskAvatarWrap: { marginBottom: 20 },
  circleGlow: {
    borderRadius: "50%",
    padding: 4,
    background: "linear-gradient(135deg, #ff3c6e, #5b8dff)",
    boxShadow: "0 0 30px rgba(255,60,110,0.4)",
  },
  taskAvatarLarge: {
    width: 160, height: 160, borderRadius: "50%",
    objectFit: "cover", display: "block",
    border: "3px solid #060d1e",
  },
  taskUsername: {
    color: "#fff", fontWeight: 800, fontSize: 18, margin: "0 0 10px",
  },
  platformBadge: {
    background: "#0e1a30", borderRadius: 20, padding: "4px 14px",
    color: "#aac", fontSize: 13,
  },
  taskActions: {
    display: "flex", gap: 12, padding: "0 16px",
  },
  btnSkip: {
    flex: 1, padding: "14px 0",
    background: "#0e1a30", border: "1px solid #1a2e50",
    borderRadius: 30, color: "#ccd",
    fontWeight: 700, fontSize: 15, cursor: "pointer",
  },
  btnAction: {
    flex: 2, padding: "14px 0",
    background: "linear-gradient(90deg, #ff3c6e, #d42b5a)",
    border: "none", borderRadius: 30,
    color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer",
    boxShadow: "0 4px 20px rgba(255,60,110,0.4)",
  },
  warningBox: {
    margin: "16px 0 0",
    background: "#120b14", border: "1px solid #2a1020",
    borderRadius: 12, padding: "12px 16px",
    color: "#ff6b8a", fontSize: 13, lineHeight: 1.5,
  },
  reportIconWrap: { display: "flex", justifyContent: "flex-end", marginBottom: 4 },
  reportIcon: {
    background: "#1a2540", border: "none", borderRadius: 20,
    color: "#778", padding: "6px 12px", cursor: "pointer", fontSize: 14,
  },
  taskConfirmCard: {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "40px 20px",
  },
  taskAvatar: {
    borderRadius: "50%", overflow: "hidden",
    width: 100, height: 100, marginBottom: 12,
    border: "3px solid #ff3c6e",
  },
  taskAvatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  timerDisplay: {
    fontSize: 48, fontWeight: 900, color: "#ff3c6e",
    marginBottom: 20,
  },
  tabRow: {
    display: "flex", background: "#0e1a30", borderRadius: 12,
    padding: 4, marginBottom: 16, gap: 4,
  },
  tab: {
    flex: 1, padding: "10px 0",
    background: "none", border: "none",
    color: "#778", fontWeight: 700, cursor: "pointer", borderRadius: 9,
    fontSize: 14,
  },
  tabActive: {
    background: "linear-gradient(90deg, #ff3c6e, #5b8dff)",
    color: "#fff",
  },
  storeList: { display: "flex", flexDirection: "column", gap: 10 },
  storeRow: {
    display: "flex", alignItems: "center",
    background: "#0e1a30", borderRadius: 12,
    padding: "14px 16px",
  },
  storeLabel: { flex: 1, color: "#fff", fontWeight: 700, fontSize: 15 },
  btnPink: {
    width: "100%", padding: "15px 0",
    background: "linear-gradient(90deg, #ff3c6e, #d42b5a)",
    border: "none", borderRadius: 30,
    color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer",
    boxShadow: "0 4px 20px rgba(255,60,110,0.35)",
  },
  btnDisabled: {
    opacity: 0.6, cursor: "not-allowed",
  },
  btnGhost: {
    width: "100%", padding: "13px 0",
    background: "none", border: "1px solid #1a2e50",
    borderRadius: 30, color: "#aac",
    fontWeight: 700, fontSize: 15, cursor: "pointer",
  },
  btnCoinSm: {
    padding: "8px 16px",
    background: "linear-gradient(90deg, #5b8dff, #3a6ddf)",
    border: "none", borderRadius: 20,
    color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
  },
  settingsGroup: {
    background: "#0e1a30", borderRadius: 14, marginBottom: 16, overflow: "hidden",
  },
  settingsRow: {
    width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 18px",
    background: "none", border: "none", borderBottom: "1px solid #0a1428",
    color: "#ccd", fontWeight: 600, fontSize: 15, cursor: "pointer",
    textAlign: "left",
  },
  chevron: { color: "#445", fontSize: 20 },
  orderRow: {
    display: "flex", alignItems: "center",
    background: "#0e1a30", borderRadius: 12,
    padding: "14px 16px", marginBottom: 10,
    gap: 10,
  },
  orderIcon: {
    width: 40, height: 40, borderRadius: "50%",
    background: "#1a2540",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 18,
  },
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(6,13,30,0.85)",
    display: "flex", alignItems: "flex-end", justifyContent: "center",
    zIndex: 100,
  },
  modal: {
    background: "#0e1a30",
    borderRadius: "24px 24px 0 0",
    padding: "24px 20px 36px",
    width: "100%", maxWidth: 430,
  },
  closeBtn: {
    background: "none", border: "none",
    color: "#778", fontSize: 20, cursor: "pointer",
  },
  radioRow: {
    display: "flex", alignItems: "center",
    padding: "14px 0", borderBottom: "1px solid #131f34",
    cursor: "pointer", gap: 14,
  },
  radio: {
    width: 20, height: 20, borderRadius: "50%",
    border: "2px solid #445", flexShrink: 0,
  },
  card: {
    background: "#0e1a30", borderRadius: 14,
    padding: "16px", display: "flex",
    alignItems: "center", justifyContent: "space-between",
  },
  langRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "#0e1a30", padding: "16px 18px",
    marginBottom: 2, borderRadius: 4,
  },
  linkBox: {
    background: "#060d1e", border: "1px solid #1a2e50",
    borderRadius: 12, padding: "12px 14px",
    display: "flex", alignItems: "flex-start", gap: 10,
  },
  copyBtn: {
    background: "none", border: "none",
    color: "#ff3c6e", fontSize: 18, cursor: "pointer",
  },
  referCard: { display: "flex", flexDirection: "column" },
  referStats: {
    background: "#0e1a30", borderRadius: 12,
    padding: "14px 16px", marginTop: 16,
  },
  faqItem: {
    background: "#0e1a30", borderRadius: 12,
    marginBottom: 10, overflow: "hidden",
  },
  faqQ: {
    width: "100%", background: "none", border: "none",
    color: "#fff", fontWeight: 700, fontSize: 14,
    padding: "16px 16px", cursor: "pointer",
    display: "flex", justifyContent: "space-between", textAlign: "left",
  },
  faqA: {
    color: "#778", fontSize: 13, lineHeight: 1.6,
    padding: "0 16px 16px", margin: 0,
  },
  toast: {
    position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
    padding: "12px 24px", borderRadius: 30,
    color: "#fff", fontWeight: 700, fontSize: 14,
    zIndex: 999, whiteSpace: "nowrap",
    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
  },
  loading: {
    width: "100%", maxWidth: 430,
    minHeight: "100vh",
    background: "#060d1e",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontSize: 18, fontWeight: 700,
  },
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #060d1e; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1a2540; border-radius: 4px; }
  button { font-family: inherit; }
  input { font-family: inherit; }
`;
