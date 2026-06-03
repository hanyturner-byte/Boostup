import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  increment,
  serverTimestamp,
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

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
const storage = getStorage(app);

// ── Initial task pool ─────────────────────────────────────────────────────────
const INITIAL_TASK_POOL = {
  tiktok: [
    { id: 1, type: "follow", platform: "tiktok", username: "mediroute", avatar: "https://i.pravatar.cc/150?img=1", reward: 5 },
    { id: 2, type: "like", platform: "tiktok", username: "mediroute", avatar: "https://i.pravatar.cc/150?img=1", reward: 3 },
  ],
  instagram: [
    { id: 3, type: "follow", platform: "instagram", username: "taker3800", avatar: "https://i.pravatar.cc/150?img=2", reward: 5 },
    { id: 4, type: "like", platform: "instagram", username: "taker3800", avatar: "https://i.pravatar.cc/150?img=2", reward: 3 },
    { id: 5, type: "follow", platform: "instagram", username: "goneaway", avatar: "https://i.pravatar.cc/150?img=3", reward: 5 },
    { id: 6, type: "like", platform: "instagram", username: "goneaway", avatar: "https://i.pravatar.cc/150?img=3", reward: 3 },
  ],
};

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

const REPORT_REASONS = ["Adult content", "Scam/spam", "Private account", "Coins not received", "Other"];

const FAQ_DATA = [
  { q: "How do I get started?", a: "Choose your platform, enter username, and start earning coins by following/liking accounts." },
  { q: "How do I earn coins?", a: "Complete tasks by following/liking on your platform. Upload a screenshot to verify. Wait for admin approval. Max 15 tasks/day." },
  { q: "How does it work?", a: "You earn coins helping others. Once you buy followers/likes, your account gets added to the task pool for others to help you!" },
  { q: "Is it safe?", a: "Yes! We never store passwords. Screenshots are manually verified by our team." },
  { q: "When do I get followers?", a: "2 minutes to 12 hours depending on order size." },
];

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("onboard");
  const [storeTab, setStoreTab] = useState("profile");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(null);
  const [taskDone, setTaskDone] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [timer, setTimer] = useState(30);
  const [timerRunning, setTimerRunning] = useState(false);
  const [toast, setToast] = useState(null);
  const [coinAnim, setCoinAnim] = useState(false);
  const [taskPool, setTaskPool] = useState([]);
  const toastRef = useRef(null);
  const timerRef = useRef(null);

  // ── Onboarding state ──────────────────────────────────────────────────────
  const [inputUser, setInputUser] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState(null);

  // ── Admin states ──────────────────────────────────────────────────────────
  const [adminAddUsername, setAdminAddUsername] = useState("");
  const [adminAddPlatform, setAdminAddPlatform] = useState("tiktok");
  const [allUsers, setAllUsers] = useState([]);
  const [allSellers, setAllSellers] = useState([]);
  const [pendingScreenshots, setPendingScreenshots] = useState([]);

  // ── Auth & load user data ────────────────────────────────────────────────────
  useEffect(() => {
    onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setUser(fbUser);
        const userRef = doc(db, "users", fbUser.uid);
        const snap = await getDoc(userRef);
        
        // Check if admin
        const adminRef = doc(db, "admins", fbUser.uid);
        const adminSnap = await getDoc(adminRef);
        setIsAdmin(adminSnap.exists());

        if (snap.exists()) {
          const data = snap.data();
          setUserData(data);
          setPage("home");
          await loadTaskPool(data.platform);
        } else {
          setUserData({ coins: 0, pendingCoins: 0, orders: [], referrals: [] });
          setPage("onboard");
        }
      } else {
        await signInAnonymously(auth);
      }
      setLoading(false);
    });
  }, []);

  // ── Load task pool ────────────────────────────────────────────────────────
  async function loadTaskPool(platform) {
    try {
      const sellersRef = collection(db, "seller_profiles");
      const q = query(sellersRef, where("platform", "==", platform));
      const snap = await getDocs(q);
      const firestoreTasks = snap.docs.map(doc => {
        const data = doc.data();
        return [
          { id: data.username + "_follow", type: "follow", platform, username: data.username, avatar: data.avatar, reward: 5 },
          { id: data.username + "_like", type: "like", platform, username: data.username, avatar: data.avatar, reward: 3 },
        ];
      }).flat();
      
      const combined = [...INITIAL_TASK_POOL[platform], ...firestoreTasks];
      setTaskPool(combined);
    } catch (e) {
      setTaskPool(INITIAL_TASK_POOL[platform] || []);
    }
  }

  // ── Timer ────────────────────────────────────────────────────────────────
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



  // ── Onboarding ──────────────────────────────────────────────────────────
  async function handleOnboard() {
    if (!inputUser.trim() || !selectedPlatform) {
      showToast("Please fill all fields ❌", "error");
      return;
    }
    const cleanUser = inputUser.trim().replace("@", "");
    const uid = user.uid;
    const refCode = `REF${uid.slice(0, 8).toUpperCase()}`;

    const newUserData = {
      username: cleanUser,
      platform: selectedPlatform,
      coins: 200,
      pendingCoins: 0,
      createdAt: serverTimestamp(),
      lastDailyReset: new Date().toDateString(),
      tasksCompletedToday: 0,
      referralCode: refCode,
      referrals: [],
      orders: [],
    };

    await setDoc(doc(db, "users", uid), newUserData);
    setUserData(newUserData);
    await loadTaskPool(selectedPlatform);
    setPage("home");
    showToast("Welcome! 🎉");
  }

  // ── Current task ────────────────────────────────────────────────────────
  if (!userData) return loading ? <div style={styles.loading}>Loading...</div> : null;

  const currentTask = taskPool.length > 0 ? taskPool[Math.floor(Math.random() * taskPool.length)] : null;

  function handleFollow() {
    if (!currentTask) return;
    const url = currentTask.platform === "tiktok"
      ? `https://www.tiktok.com/@${currentTask.username}`
      : `https://www.instagram.com/${currentTask.username}`;
    window.open(url, "_blank");
    setTaskDone(true);
    setTimer(30);
    setTimerRunning(true);
  }

  async function handleUploadScreenshot() {
    if (!screenshotFile) {
      showToast("Select a screenshot ❌", "error");
      return;
    }

    setUploadingScreenshot(true);
    try {
      const fileName = `${user.uid}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const storageRef = ref(storage, `screenshots/${fileName}`);
      await uploadBytes(storageRef, screenshotFile);
      const downloadUrl = await getDownloadURL(storageRef);

      // Create pending verification entry
      const pendingRef = doc(collection(db, "pending_verifications"));
      await setDoc(pendingRef, {
        userId: user.uid,
        username: userData.username,
        platform: userData.platform,
        taskType: currentTask.type,
        taskUsername: currentTask.username,
        screenshotUrl: downloadUrl,
        reward: currentTask.reward,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      // Update user pending coins
      const newPendingCoins = (userData.pendingCoins || 0) + currentTask.reward;
      setUserData(u => ({ ...u, pendingCoins: newPendingCoins }));
      await updateDoc(doc(db, "users", user.uid), { pendingCoins: increment(currentTask.reward) });

      setTaskDone(false);
      setScreenshotFile(null);
      setTimerRunning(false);
      showToast("Screenshot submitted! ⏳ Waiting for approval...");
    } catch (e) {
      showToast("Error uploading screenshot ❌", "error");
    }
    setUploadingScreenshot(false);
  }

  // ── Store purchase ──────────────────────────────────────────────────────
  async function handleBuyCoin(item) {
    if (userData.coins < item.coins) {
      showToast("Not enough coins ❌", "error");
      return;
    }

    const newCoins = userData.coins - item.coins;
    setUserData(u => ({ ...u, coins: newCoins }));
    await updateDoc(doc(db, "users", user.uid), { coins: newCoins }).catch(() => {});

    // Auto-add to seller pool
    try {
      const sellerRef = doc(db, "seller_profiles", user.uid);
      await setDoc(sellerRef, {
        username: userData.username,
        platform: userData.platform,
        avatar: `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70)}`,
        createdAt: serverTimestamp(),
      }, { merge: true });
      await loadTaskPool(userData.platform);
    } catch (e) {}

    const orderId = Date.now();
    const order = {
      id: orderId,
      label: item.label,
      cost: item.coins,
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

  // ── Referral ────────────────────────────────────────────────────────────
  const referralLink = `${window.location.origin}?ref=${userData.referralCode}`;

  function handleCopyRef() {
    navigator.clipboard.writeText(referralLink).catch(() => {});
    showToast("Referral link copied! 🔗");
  }

  // ── Admin functions ──────────────────────────────────────────────────────
  async function adminLoadUsers() {
    try {
      const usersRef = collection(db, "users");
      const snap = await getDocs(usersRef);
      const users = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
      setAllUsers(users);
      showToast("Users loaded ✓");
    } catch (e) {
      showToast("Error loading users ❌", "error");
    }
  }

  async function adminLoadSellers() {
    try {
      const sellersRef = collection(db, "seller_profiles");
      const snap = await getDocs(sellersRef);
      const sellers = snap.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
      setAllSellers(sellers);
      showToast("Sellers loaded ✓");
    } catch (e) {
      showToast("Error loading sellers ❌", "error");
    }
  }

  async function adminLoadPendingScreenshots() {
    try {
      const pendingRef = collection(db, "pending_verifications");
      const q = query(pendingRef, where("status", "==", "pending"));
      const snap = await getDocs(q);
      const pending = snap.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
      setPendingScreenshots(pending);
      showToast(`${pending.length} pending screenshots`);
    } catch (e) {
      showToast("Error loading pending ❌", "error");
    }
  }

  async function adminApproveScreenshot(docId, userId, reward) {
    try {
      // Update verification status
      await updateDoc(doc(db, "pending_verifications", docId), { status: "approved" });
      
      // Credit coins to user
      await updateDoc(doc(db, "users", userId), {
        coins: increment(reward),
        pendingCoins: increment(-reward),
      });

      await adminLoadPendingScreenshots();
      showToast("Screenshot approved ✅");
    } catch (e) {
      showToast("Error approving ❌", "error");
    }
  }

  async function adminRejectScreenshot(docId, userId, reward) {
    try {
      // Update verification status
      await updateDoc(doc(db, "pending_verifications", docId), { status: "rejected" });
      
      // Remove pending coins
      await updateDoc(doc(db, "users", userId), {
        pendingCoins: increment(-reward),
      });

      await adminLoadPendingScreenshots();
      showToast("Screenshot rejected ❌");
    } catch (e) {
      showToast("Error rejecting ❌", "error");
    }
  }

  async function adminAddSeller() {
    if (!adminAddUsername.trim()) {
      showToast("Enter a username ❌", "error");
      return;
    }
    try {
      const docId = `seller_${Date.now()}`;
      await setDoc(doc(db, "seller_profiles", docId), {
        username: adminAddUsername.trim().replace("@", ""),
        platform: adminAddPlatform,
        avatar: `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70)}`,
        createdAt: serverTimestamp(),
      });
      setAdminAddUsername("");
      await adminLoadSellers();
      showToast("Seller added ✅");
    } catch (e) {
      showToast("Error adding seller ❌", "error");
    }
  }

  async function adminRemoveSeller(docId) {
    try {
      await deleteDoc(doc(db, "seller_profiles", docId));
      await adminLoadSellers();
      showToast("Seller removed ✅");
    } catch (e) {
      showToast("Error removing seller ❌", "error");
    }
  }

  async function adminBanUser(uid) {
    try {
      await updateDoc(doc(db, "users", uid), { banned: true });
      await adminLoadUsers();
      showToast("User banned ✅");
    } catch (e) {
      showToast("Error banning user ❌", "error");
    }
  }

  async function adminEditCoins(uid, newCoins) {
    try {
      await updateDoc(doc(db, "users", uid), { coins: newCoins });
      await adminLoadUsers();
      showToast("Coins updated ✅");
    } catch (e) {
      showToast("Error updating coins ❌", "error");
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      setUserData(null);
      setPage("onboard");
      setInputUser("");
      setSelectedPlatform(null);
      showToast("Signed out ✓");
    } catch (e) {
      showToast("Error signing out ❌", "error");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
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
            <button style={{ ...styles.btnPink, marginTop: 20 }} onClick={() => reportReason && setReportOpen(false)}>SUBMIT</button>
          </div>
        </div>
      )}

      {/* ── ONBOARDING ─────────────────────────────────────────── */}
      {page === "onboard" && (
        <div style={styles.onboard}>
          <div style={styles.logoGlow}>
            <span style={styles.logoText}>⚡BoostUp</span>
          </div>
          <p style={styles.onboardSub}>Choose your platform & grow.</p>
          
          <div style={styles.platformRow}>
            <button
              style={{ ...styles.platformBtn, ...(selectedPlatform === "tiktok" ? styles.platformActive : {}) }}
              onClick={() => setSelectedPlatform("tiktok")}
            >
              🎵 TikTok
            </button>
            <button
              style={{ ...styles.platformBtn, ...(selectedPlatform === "instagram" ? styles.platformActive : {}) }}
              onClick={() => setSelectedPlatform("instagram")}
            >
              📸 Instagram
            </button>
          </div>

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
          <p style={styles.onboardNote}>No password. 100% safe.</p>
        </div>
      )}

      {/* ── MAIN APP ───────────────────────────────────────────── */}
      {page !== "onboard" && (
        <div style={styles.appWrap}>
          <header style={styles.header}>
            {(page === "orders" || page === "manageAccount" || page === "language" || page === "refer" || page === "faq" || page === "admin") ? (
              <button style={styles.backBtn} onClick={() => setPage("more")}>‹</button>
            ) : (
              <div style={styles.avatar}>⚡</div>
            )}
            <span style={styles.headerTitle}>
              {page === "home" ? "BoostUp" : page === "store" ? "Store" : page === "more" ? "Settings" : page === "orders" ? "Orders" : page === "manageAccount" ? "Account" : page === "admin" ? "Admin" : "More"}
            </span>
            <div style={{ ...styles.coinBadge, ...(coinAnim ? styles.coinBounce : {}) }}>
              ⭐ {userData.coins}
            </div>
          </header>

          {/* ── HOME ── */}
          {page === "home" && currentTask && (
            <div style={styles.pageContent}>
              {taskDone ? (
                <div style={styles.taskConfirmCard}>
                  <p style={{ color: "#aac", marginBottom: 12, fontSize: 14 }}>
                    {timerRunning ? `Wait ${timer}s before uploading...` : "Upload screenshot to verify:"}
                  </p>
                  {timerRunning && <div style={styles.timerDisplay}>{timer}s</div>}
                  
                  <div style={styles.taskAvatar}>
                    <img src={currentTask.avatar} alt="" style={styles.taskAvatarImg} />
                  </div>
                  <p style={{ color: "#fff", fontWeight: 700, marginBottom: 20 }}>@{currentTask.username}</p>

                  {!timerRunning && (
                    <>
                      <div style={styles.uploadBox}>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => setScreenshotFile(e.target.files?.[0] || null)}
                          style={{ display: "none" }}
                          id="screenshot-input"
                        />
                        <label htmlFor="screenshot-input" style={{ ...styles.uploadLabel, cursor: "pointer" }}>
                          {screenshotFile ? `📸 ${screenshotFile.name}` : "📸 Select screenshot"}
                        </label>
                      </div>
                      <button
                        style={{ ...styles.btnPink, ...(uploadingScreenshot ? styles.btnDisabled : {}) }}
                        onClick={handleUploadScreenshot}
                        disabled={uploadingScreenshot}
                      >
                        {uploadingScreenshot ? "Uploading..." : `Submit +${currentTask.reward} ⭐`}
                      </button>
                    </>
                  )}

                  <button style={{ ...styles.btnGhost, marginTop: 10 }} onClick={() => { setTaskDone(false); setScreenshotFile(null); setTimerRunning(false); }}>Back</button>
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
                    <button style={styles.btnSkip}>Skip</button>
                    <button style={styles.btnAction} onClick={handleFollow}>
                      {currentTask.type === "follow" ? "Follow" : "Like"} +{currentTask.reward} ⭐
                    </button>
                  </div>
                  <div style={styles.warningBox}>
                    📸 Screenshot required. 30 second timer. Admin reviews.
                  </div>
                  {userData.pendingCoins > 0 && (
                    <div style={{ ...styles.warningBox, background: "#1a2540", color: "#4ddfaa", marginTop: 12 }}>
                      ⏳ {userData.pendingCoins} coins pending approval
                    </div>
                  )}
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

          {/* ── MORE ── */}
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
                <button style={styles.settingsRow} onClick={() => setPage("faq")}>
                  <span>FAQ</span><span style={styles.chevron}>›</span>
                </button>
              </div>
              {isAdmin && (
                <div style={styles.settingsGroup}>
                  <button style={{ ...styles.settingsRow, background: "#1a2540" }} onClick={() => setPage("admin")}>
                    <span style={{ color: "#ff3c6e", fontWeight: 800 }}>🔐 Admin Panel</span><span style={styles.chevron}>›</span>
                  </button>
                </div>
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
                <div style={{ flex: 1, marginLeft: 12 }}>
                  <span style={{ color: "#fff", display: "block", fontWeight: 700 }}>@{userData.username}</span>
                  <span style={{ color: "#778", fontSize: 12 }}>{userData.platform === "tiktok" ? "🎵 TikTok" : "📸 Instagram"}</span>
                </div>
              </div>
              <p style={{ color: "#778", fontSize: 13, marginTop: 16 }}>
                Ref Code: <span style={{ color: "#ff3c6e", fontWeight: 700 }}>{userData.referralCode}</span>
              </p>
              <button style={{ ...styles.btnPink, marginTop: 30 }} onClick={handleSignOut}>Sign Out</button>
            </div>
          )}

          {/* ── ORDERS ── */}
          {page === "orders" && (
            <div style={styles.pageContent}>
              {(userData.orders || []).length === 0 ? (
                <p style={{ color: "#556", textAlign: "center", marginTop: 40 }}>No orders</p>
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

          {/* ── REFER ── */}
          {page === "refer" && (
            <div style={styles.pageContent}>
              <div style={styles.referCard}>
                <h2 style={{ color: "#fff", fontSize: 20, marginBottom: 8 }}>Invite & Earn 200 coins!</h2>
                <p style={{ color: "#778", fontSize: 13, marginBottom: 20 }}>Reward when they sign up with your link.</p>
                <div style={styles.linkBox}>
                  <span style={{ color: "#aac", fontSize: 12, flex: 1, wordBreak: "break-all" }}>{referralLink}</span>
                  <button style={styles.copyBtn} onClick={handleCopyRef}>⧉</button>
                </div>
                <button style={{ ...styles.btnPink, marginTop: 16 }} onClick={handleCopyRef}>Share</button>
              </div>
            </div>
          )}

          {/* ── FAQ ── */}
          {page === "faq" && (
            <div style={styles.pageContent}>
              {FAQ_DATA.map((item, i) => <FaqItem key={i} q={item.q} a={item.a} />)}
            </div>
          )}

          {/* ── ADMIN PANEL ── */}
          {page === "admin" && isAdmin && (
            <div style={styles.pageContent}>
              <h2 style={{ color: "#fff", marginBottom: 20 }}>🔐 Admin Panel</h2>

              {/* Pending Screenshots */}
              <div style={{ ...styles.card, flexDirection: "column", marginBottom: 16 }}>
                <button style={styles.btnPink} onClick={adminLoadPendingScreenshots}>Load Pending Screenshots</button>
                {pendingScreenshots.map(pending => (
                  <div key={pending.docId} style={{ ...styles.orderRow, marginTop: 8, flexDirection: "column", alignItems: "flex-start" }}>
                    <div style={{ width: "100%", marginBottom: 8 }}>
                      <p style={{ color: "#fff", margin: 0, fontWeight: 600 }}>@{pending.username}</p>
                      <p style={{ color: "#778", margin: 0, fontSize: 12 }}>{pending.taskType} @{pending.taskUsername}</p>
                      <img src={pending.screenshotUrl} alt="screenshot" style={{ width: "100%", maxHeight: 200, marginTop: 8, borderRadius: 8 }} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={styles.btnCoinSm} onClick={() => adminApproveScreenshot(pending.docId, pending.userId, pending.reward)}>Approve ✅</button>
                      <button style={{ ...styles.btnCoinSm, background: "#e5214a" }} onClick={() => adminRejectScreenshot(pending.docId, pending.userId, pending.reward)}>Reject ❌</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Seller */}
              <div style={{ ...styles.card, flexDirection: "column", marginBottom: 16 }}>
                <h3 style={{ color: "#fff", marginBottom: 12 }}>Add Seller</h3>
                <input
                  style={{ ...styles.input, background: "#0e1a30", border: "1px solid #1a2e50", padding: "8px 12px", borderRadius: 8, marginBottom: 8 }}
                  placeholder="@username"
                  value={adminAddUsername}
                  onChange={e => setAdminAddUsername(e.target.value)}
                />
                <select
                  style={{ ...styles.input, background: "#0e1a30", border: "1px solid #1a2e50", padding: "8px 12px", borderRadius: 8, marginBottom: 8, color: "#fff" }}
                  value={adminAddPlatform}
                  onChange={e => setAdminAddPlatform(e.target.value)}
                >
                  <option value="tiktok">🎵 TikTok</option>
                  <option value="instagram">📸 Instagram</option>
                </select>
                <button style={styles.btnPink} onClick={adminAddSeller}>Add Seller</button>
              </div>

              {/* List Sellers */}
              <div style={{ ...styles.card, flexDirection: "column", marginBottom: 16 }}>
                <button style={styles.btnPink} onClick={adminLoadSellers}>Load All Sellers</button>
                {allSellers.map(seller => (
                  <div key={seller.docId} style={{ ...styles.orderRow, marginTop: 8 }}>
                    <div>
                      <p style={{ color: "#fff", margin: 0, fontWeight: 600 }}>@{seller.username}</p>
                      <p style={{ color: "#778", margin: 0, fontSize: 12 }}>{seller.platform}</p>
                    </div>
                    <button style={{ ...styles.btnCoinSm, background: "#e5214a" }} onClick={() => adminRemoveSeller(seller.docId)}>Remove</button>
                  </div>
                ))}
              </div>

              {/* List Users */}
              <div style={{ ...styles.card, flexDirection: "column" }}>
                <button style={styles.btnPink} onClick={adminLoadUsers}>Load All Users</button>
                {allUsers.slice(0, 10).map(u => (
                  <div key={u.uid} style={{ ...styles.orderRow, marginTop: 8, flexDirection: "column", alignItems: "flex-start" }}>
                    <div style={{ width: "100%", marginBottom: 8 }}>
                      <p style={{ color: "#fff", margin: 0, fontWeight: 600 }}>@{u.username}</p>
                      <p style={{ color: "#778", margin: 0, fontSize: 12 }}>⭐ {u.coins} | ⏳ {u.pendingCoins || 0}</p>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="number" defaultValue={u.coins} onBlur={e => adminEditCoins(u.uid, parseInt(e.target.value) || 0)} style={{ width: 70, padding: "4px 8px", borderRadius: 4 }} />
                      <button style={{ ...styles.btnCoinSm, background: "#e5214a" }} onClick={() => adminBanUser(u.uid)}>Ban</button>
                    </div>
                  </div>
                ))}
              </div>
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
  root: { minHeight: "100vh", background: "#060d1e", display: "flex", justifyContent: "center", alignItems: "flex-start", fontFamily: "'Nunito', sans-serif" },
  appWrap: { width: "100%", maxWidth: 430, minHeight: "100vh", background: "linear-gradient(160deg, #0a1428 0%, #060d1e 100%)", display: "flex", flexDirection: "column" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 10px", borderBottom: "1px solid #0e1e35" },
  avatar: { width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #ff3c6e, #5b8dff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 },
  acctAvatar: { width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #ff3c6e, #5b8dff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 },
  headerTitle: { color: "#fff", fontWeight: 800, fontSize: 18, letterSpacing: 0.5 },
  coinBadge: { background: "#1a2540", borderRadius: 20, padding: "6px 12px", color: "#ffd700", fontWeight: 800, fontSize: 15 },
  coinBounce: { transform: "scale(1.3)" },
  backBtn: { background: "none", border: "none", color: "#fff", fontSize: 28, cursor: "pointer", padding: "0 8px" },
  pageContent: { flex: 1, overflowY: "auto", padding: "16px", paddingBottom: 80 },
  bottomNav: { position: "sticky", bottom: 0, display: "flex", background: "#0a1428", borderTop: "1px solid #0e1e35", padding: "8px 0 4px" },
  navBtn: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "none", border: "none", color: "#556", fontSize: 11, cursor: "pointer", gap: 2 },
  navActive: { color: "#ff3c6e" },
  navIcon: { fontSize: 20 },
  onboard: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", width: "100%", maxWidth: 430, padding: "0 24px", gap: 16 },
  logoGlow: { background: "radial-gradient(ellipse at center, rgba(255,60,110,0.25) 0%, transparent 70%)", padding: "40px 20px 20px" },
  logoText: { fontSize: 42, fontWeight: 900, letterSpacing: -1, background: "linear-gradient(90deg, #ff3c6e, #5b8dff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  onboardSub: { color: "#778", textAlign: "center", fontSize: 15, lineHeight: 1.6, margin: 0 },
  platformRow: { display: "flex", gap: 12, width: "100%" },
  platformBtn: { flex: 1, padding: "12px 16px", background: "#0e1a30", border: "1px solid #1a2e50", borderRadius: 14, color: "#ccd", fontWeight: 700, cursor: "pointer" },
  platformActive: { background: "linear-gradient(90deg, #ff3c6e, #d42b5a)", border: "none", color: "#fff" },
  inputWrap: { display: "flex", alignItems: "center", background: "#0e1a30", border: "1px solid #1a2e50", borderRadius: 14, padding: "12px 16px", width: "100%" },
  inputAt: { color: "#ff3c6e", fontWeight: 700, fontSize: 18, marginRight: 6 },
  input: { background: "none", border: "none", outline: "none", color: "#fff", fontSize: 16, flex: 1 },
  onboardNote: { color: "#334", fontSize: 12, margin: 0 },
  taskCard: { display: "flex", flexDirection: "column", alignItems: "center", padding: "30px 20px 20px" },
  taskAvatarWrap: { marginBottom: 20 },
  circleGlow: { borderRadius: "50%", padding: 4, background: "linear-gradient(135deg, #ff3c6e, #5b8dff)", boxShadow: "0 0 30px rgba(255,60,110,0.4)" },
  taskAvatarLarge: { width: 160, height: 160, borderRadius: "50%", objectFit: "cover", display: "block", border: "3px solid #060d1e" },
  taskUsername: { color: "#fff", fontWeight: 800, fontSize: 18, margin: "0 0 10px" },
  platformBadge: { background: "#0e1a30", borderRadius: 20, padding: "4px 14px", color: "#aac", fontSize: 13 },
  taskActions: { display: "flex", gap: 12, padding: "0 16px" },
  btnSkip: { flex: 1, padding: "14px 0", background: "#0e1a30", border: "1px solid #1a2e50", borderRadius: 30, color: "#ccd", fontWeight: 700, fontSize: 15, cursor: "pointer" },
  btnAction: { flex: 2, padding: "14px 0", background: "linear-gradient(90deg, #ff3c6e, #d42b5a)", border: "none", borderRadius: 30, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 20px rgba(255,60,110,0.4)" },
  warningBox: { margin: "16px 0 0", background: "#120b14", border: "1px solid #2a1020", borderRadius: 12, padding: "12px 16px", color: "#ff6b8a", fontSize: 13, lineHeight: 1.5 },
  reportIconWrap: { display: "flex", justifyContent: "flex-end", marginBottom: 4 },
  reportIcon: { background: "#1a2540", border: "none", borderRadius: 20, color: "#778", padding: "6px 12px", cursor: "pointer", fontSize: 14 },
  taskConfirmCard: { display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px" },
  taskAvatar: { borderRadius: "50%", overflow: "hidden", width: 100, height: 100, marginBottom: 12, border: "3px solid #ff3c6e" },
  taskAvatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  timerDisplay: { fontSize: 48, fontWeight: 900, color: "#ff3c6e", marginBottom: 20 },
  uploadBox: { width: "100%", marginBottom: 12, padding: "20px", background: "#0e1a30", border: "2px dashed #ff3c6e", borderRadius: 12, textAlign: "center" },
  uploadLabel: { color: "#aac", fontWeight: 700, fontSize: 14 },
  tabRow: { display: "flex", background: "#0e1a30", borderRadius: 12, padding: 4, marginBottom: 16, gap: 4 },
  tab: { flex: 1, padding: "10px 0", background: "none", border: "none", color: "#778", fontWeight: 700, cursor: "pointer", borderRadius: 9, fontSize: 14 },
  tabActive: { background: "linear-gradient(90deg, #ff3c6e, #5b8dff)", color: "#fff" },
  storeList: { display: "flex", flexDirection: "column", gap: 10 },
  storeRow: { display: "flex", alignItems: "center", background: "#0e1a30", borderRadius: 12, padding: "14px 16px" },
  storeLabel: { flex: 1, color: "#fff", fontWeight: 700, fontSize: 15 },
  btnPink: { width: "100%", padding: "15px 0", background: "linear-gradient(90deg, #ff3c6e, #d42b5a)", border: "none", borderRadius: 30, color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer", boxShadow: "0 4px 20px rgba(255,60,110,0.35)" },
  btnDisabled: { opacity: 0.6, cursor: "not-allowed" },
  btnGhost: { width: "100%", padding: "13px 0", background: "none", border: "1px solid #1a2e50", borderRadius: 30, color: "#aac", fontWeight: 700, fontSize: 15, cursor: "pointer" },
  btnCoinSm: { padding: "8px 16px", background: "linear-gradient(90deg, #5b8dff, #3a6ddf)", border: "none", borderRadius: 20, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  settingsGroup: { background: "#0e1a30", borderRadius: 14, marginBottom: 16, overflow: "hidden" },
  settingsRow: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", background: "none", border: "none", borderBottom: "1px solid #0a1428", color: "#ccd", fontWeight: 600, fontSize: 15, cursor: "pointer", textAlign: "left" },
  chevron: { color: "#445", fontSize: 20 },
  orderRow: { display: "flex", alignItems: "center", background: "#0e1a30", borderRadius: 12, padding: "14px 16px", marginBottom: 10, gap: 10 },
  orderIcon: { width: 40, height: 40, borderRadius: "50%", background: "#1a2540", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 },
  overlay: { position: "fixed", inset: 0, background: "rgba(6,13,30,0.85)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 },
  modal: { background: "#0e1a30", borderRadius: "24px 24px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 430 },
  closeBtn: { background: "none", border: "none", color: "#778", fontSize: 20, cursor: "pointer" },
  radioRow: { display: "flex", alignItems: "center", padding: "14px 0", borderBottom: "1px solid #131f34", cursor: "pointer", gap: 14 },
  radio: { width: 20, height: 20, borderRadius: "50%", border: "2px solid #445", flexShrink: 0 },
  card: { background: "#0e1a30", borderRadius: 14, padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  linkBox: { background: "#060d1e", border: "1px solid #1a2e50", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 },
  copyBtn: { background: "none", border: "none", color: "#ff3c6e", fontSize: 18, cursor: "pointer" },
  referCard: { display: "flex", flexDirection: "column" },
  faqItem: { background: "#0e1a30", borderRadius: 12, marginBottom: 10, overflow: "hidden" },
  faqQ: { width: "100%", background: "none", border: "none", color: "#fff", fontWeight: 700, fontSize: 14, padding: "16px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", textAlign: "left" },
  faqA: { color: "#778", fontSize: 13, lineHeight: 1.6, padding: "0 16px 16px", margin: 0 },
  toast: { position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", padding: "12px 24px", borderRadius: 30, color: "#fff", fontWeight: 700, fontSize: 14, zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" },
  loading: { width: "100%", maxWidth: 430, minHeight: "100vh", background: "#060d1e", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 18, fontWeight: 700 },
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
  select { font-family: inherit; }
`;
