import React, { useState, useEffect } from 'react';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { Capacitor } from '@capacitor/core';
import { 
  auth, 
  db, 
  googleProvider 
} from './firebase';
import { 
  signInWithPopup, 
  signInWithCredential, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDoc, 
  addDoc 
} from 'firebase/firestore';
import TournamentEditor from './TournamentEditor';

const App = () => {
  const [user, setUser] = useState(null);
  const [myTournaments, setMyTournaments] = useState([]);
  const [followedTournaments, setFollowedTournaments] = useState([]); 
  const [searchResults, setSearchResults] = useState([]);
  const [activeTournament, setActiveTournament] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // --- Auth & Initialization ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      console.log("Auth State Changed. User:", u?.email);
      setUser(u);
      setLoading(false); 
    }, (error) => {
      console.error("Auth Listener Error:", error);
      setLoading(false);
    });

    const initGoogle = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          await GoogleSignIn.initialize({
            clientId: '202745059405-dcjv75spujuas7tdsn1sh8vd9fnkittu.apps.googleusercontent.com',
          });
        } catch (e) {
          console.warn("Native Google Init failed:", e);
        }
      }
    };

    initGoogle();
    return unsubscribe;
  }, []);

  // --- Login/Logout Logic ---
  const handleLogin = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await GoogleSignIn.signIn();
        const credential = GoogleAuthProvider.credential(result.idToken);
        await signInWithCredential(auth, credential);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (error) {
      console.error("Login Error:", error);
      alert(`Login failed: ${error.message}`);
    }
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      await signOut(auth);
      setUser(null);
      setActiveTournament(null);
      setSearchResults([]);
      setMyTournaments([]);
      setFollowedTournaments([]);
      setSearchQuery('');
      console.log("Logout successful");
    } catch (error) {
      console.error("Logout Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- Sync Followed/Saved Tournaments ---
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "savedTournaments"), where("userId", "==", user.uid));
    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => d.data().tournamentData);
      setFollowedTournaments(list);
    });
  }, [user]);

  // --- Sync My Tournaments ---
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "tournaments"), where("owner", "==", user.uid));
    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMyTournaments(list);
      if (activeTournament && activeTournament.owner === user.uid) {
        const updated = list.find(t => t.id === activeTournament.id);
        if (updated) setActiveTournament(updated);
      }
    });
  }, [user, activeTournament?.id]);

  const handleSearch = async () => {
    const currentUser = auth.currentUser;
    if (!searchQuery.trim()) return;
    if (!currentUser) {
      alert("Please wait for auth to complete or log in again.");
      return;
    }

    try {
      const snap = await getDocs(collection(db, "tournaments"));
      const allTourns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = allTourns.filter(t => 
        t.name && t.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSearchResults(filtered);
      if (filtered.length === 0) alert("No tournaments found.");
    } catch (error) {
      console.error("Search Error:", error);
    }
  };

  const loadTournament = async (t) => {
    const isOwner = t.owner === user.uid;
    
    if (!isOwner) {
      const saveId = `${user.uid}_${t.id}`;
      try {
        await setDoc(doc(db, "savedTournaments", saveId), {
          userId: user.uid,
          tournamentId: t.id,
          tournamentData: { ...t, id: t.id },
          savedAt: Date.now()
        }, { merge: true });
        console.log("Tournament pinned to sidebar");
      } catch (e) {
        console.error("Error saving to history:", e);
      }
    }

    if (isOwner) {
      setActiveTournament(t);
      return;
    }

    try {
      const predRef = doc(db, "predictions", `${user.uid}_${t.id}`);
      const predSnap = await getDoc(predRef);
      let savedPredData = predSnap.exists() ? (predSnap.data().predictions || {}) : {};

      setActiveTournament({ 
        ...t, 
        predictions: { [user.uid]: savedPredData },
        isPrediction: true 
      });
    } catch (error) {
      setActiveTournament({ ...t, predictions: {}, isPrediction: true });
    }
  };

  const removeFollowedTournament = async (e, tournamentId) => {
    e.stopPropagation(); 
    if (window.confirm("Remove this tournament from your list?")) {
      try {
        await deleteDoc(doc(db, "savedTournaments", `${user.uid}_${tournamentId}`));
        if (activeTournament?.id === tournamentId) setActiveTournament(null);
      } catch (e) {
        alert("Failed to remove.");
      }
    }
  };

  const deleteTournament = async (id) => {
    if (window.confirm("Delete this tournament permanently?")) {
      try {
        await deleteDoc(doc(db, "tournaments", id));
        setActiveTournament(null);
      } catch (error) {
        alert("Failed to delete.");
      }
    }
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  if (!user) return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center p-8 bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4">
        <h1 className="text-2xl font-black text-blue-800 mb-2">WELCOME</h1>
        <p className="text-gray-500 text-sm mb-8">Sign in to start predicting your playoffs</p>
        <button 
          onClick={handleLogin} 
          className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg active:scale-95"
        >
          Login with Google
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto min-h-screen font-sans bg-gray-50/50">
      {/* STICKY HEADER SECTION */}
      <header className="sticky top-0 z-50 flex justify-between items-center bg-white/95 backdrop-blur-sm p-4 shadow-sm border-b border-gray-100">
        <div className="flex items-center gap-3">
          {activeTournament ? (
            <h1 
              onClick={() => {
                setActiveTournament(null);
                window.scrollTo(0,0);
              }} 
              className="text-sm font-black text-blue-800 cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-2"
              title="Click to go back"
            >
              <span className="text-lg">←</span> {activeTournament.name.toUpperCase()}
            </h1>
          ) : (
            <h1 className="text-xl font-black text-blue-800 tracking-tight">
              PLAYOFF PREDICTOR
            </h1>
          )}
        </div>

        <div className="flex gap-4 items-center">
          <div className="flex border rounded-lg overflow-hidden bg-white shadow-sm focus-within:ring-1 focus-within:ring-blue-400">
            <input 
              className="p-2 text-xs outline-none w-24 md:w-64" 
              placeholder="Search..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
            />
            <button 
              onClick={handleSearch} 
              className="bg-blue-600 text-white px-3 text-[10px] font-bold uppercase hover:bg-blue-700"
            >
              Search
            </button>
          </div>
          
          <button 
            onClick={handleLogout} 
            className="text-[10px] text-red-500 font-black uppercase hover:text-red-700"
          >
            Logout
          </button>
        </div>
      </header>

      {/* MAIN CONTENT PADDING ADAPTED FOR STICKY HEADER */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="space-y-6">
          {searchResults.length > 0 && (
            <div>
              <h2 className="text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">Search Results</h2>
              {searchResults.map(t => (
                <button key={t.id} onClick={() => loadTournament(t)} className="w-full text-left p-3 mb-2 bg-blue-50 rounded-lg text-sm font-bold border border-blue-100">🔍 {t.name}</button>
              ))}
              <button onClick={() => setSearchResults([])} className="text-[9px] text-blue-500 underline mb-4">Clear results</button>
            </div>
          )}

          {followedTournaments.length > 0 && (
            <div>
              <h2 className="text-[10px] font-black text-gray-400 uppercase mb-4 tracking-widest">Followed & Predicting</h2>
              {followedTournaments.map(t => (
                <button 
                  key={t.id} 
                  onClick={() => loadTournament(t)} 
                  className={`w-full text-left p-3 rounded-lg text-sm font-bold mb-2 transition-all flex justify-between items-center group ${activeTournament?.id === t.id ? 'bg-amber-500 text-white shadow-md' : 'bg-white border border-gray-100 text-gray-600 hover:bg-gray-50'}`}
                >
                  <span className="truncate pr-2">🏆 {t.name}</span>
                  <span 
                    onClick={(e) => removeFollowedTournament(e, t.id)} 
                    className={`text-[10px] font-black px-1.5 py-0.5 rounded ${activeTournament?.id === t.id ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-red-500 hover:text-white'}`}
                  >
                    ✕
                  </span>
                </button>
              ))}
            </div>
          )}
          
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">My Tournaments</h2>
              <button onClick={async () => {
                const n = prompt("Tournament Name:");
                if(n) await addDoc(collection(db, "tournaments"), { name: n, owner: user.uid, teams: [], matches: [], createdAt: Date.now() });
              }} className="bg-blue-600 text-white w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xl shadow-md">+</button>
            </div>
            {myTournaments.map(t => (
              <button key={t.id} onClick={() => loadTournament(t)} className={`w-full text-left p-3 rounded-lg text-sm font-bold mb-2 transition-all ${activeTournament?.id === t.id ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-gray-100 text-gray-600 hover:bg-gray-50'}`}>
                {t.name}
              </button>
            ))}
          </div>
        </aside>

        <main className="lg:col-span-3">
          {activeTournament ? (
            <TournamentEditor 
              data={activeTournament} 
              user={user}
              onDeleteTournament={deleteTournament} 
              onUpdate={async (newData) => {
                if (activeTournament.owner === user.uid) {
                  await setDoc(doc(db, "tournaments", activeTournament.id), newData, { merge: true });
                  setActiveTournament({ ...activeTournament, ...newData });
                } else {
                  const userPredictions = newData.predictions?.[user.uid] || {};
                  const predRef = doc(db, "predictions", `${user.uid}_${activeTournament.id}`);
                  await setDoc(predRef, { 
                    userId: user.uid, 
                    tournamentId: activeTournament.id, 
                    predictions: userPredictions 
                  }, { merge: true });
                  setActiveTournament(newData);
                }
              }}
            />
          ) : (
            <div className="h-64 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center text-gray-400 bg-white">
              <p className="font-medium uppercase text-[10px] tracking-widest">Workspace Empty</p>
              <p className="text-sm mt-2">Select a tournament to start predicting</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;