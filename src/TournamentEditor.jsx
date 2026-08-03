import React, { useState, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const TournamentEditor = ({ data, onUpdate, user, onDeleteTournament, allTournaments = [] }) => {
  const [teamInput, setTeamInput] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('Group A');
  const [groups, setGroups] = useState(['Group A', 'Group B']);
  
  const [manualT1, setManualT1] = useState('');
  const [manualT2, setManualT2] = useState('');

  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // Safe checks for when 'data' hasn't been selected or loaded yet
  const isOwner = user?.uid === data?.owner;
  const now = new Date();

  // --- 1. CASE-INSENSITIVE TOURNAMENT SEARCH FILTER ---
  const filteredTournaments = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return allTournaments.filter(t => 
      t.name && t.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, allTournaments]);

  // --- HELPERS ---
  const canEditMatch = (matchDate) => {
    if (isOwner) return true;
    if (!matchDate) return false; 

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const matchDay = new Date(matchDate.replace(/-/g, '\/'));
    matchDay.setHours(0, 0, 0, 0);

    return matchDay >= today;
  };

  const toDecimalOvers = (oversStr) => {
    const val = parseFloat(oversStr || 0);
    const completedOvers = Math.floor(val);
    const balls = Math.round((val - completedOvers) * 10);
    return completedOvers + (balls / 6);
  };

  const createMatchObject = (t1, t2) => ({
    id: `m-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    t1, t2, result: null, date: '',
    t1Runs: '', t1Overs: '', t1Wickets: '',
    t2Runs: '', t2Overs: '', t2Wickets: '',
  });

  // --- MEMOIZED DATA ---
  const sortedMatches = useMemo(() => {
    return [...(data?.matches || [])].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    });
  }, [data?.matches]);

  const sortedTeamsForDropdown = useMemo(() => {
    return [...(data?.teams || [])].sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.teams]);

  const groupStats = useMemo(() => {
    const results = {};
    if (!data) return results;

    (data.teams || []).forEach(t => {
      results[t.group] = results[t.group] || [];
      results[t.group].push({ 
        name: t.name, p: 0, w: 0, l: 0, d: 0, pts: 0, 
        runsScored: 0, actualOversFaced: 0, runsConceded: 0, actualOversBowled: 0, nrr: 0
      });
    });

    const userPredictions = data.predictions?.[user?.uid] || {};

    (data.matches || []).forEach(m => {
      const effectiveResult = isOwner ? m.result : (userPredictions[m.id] !== undefined ? userPredictions[m.id] : m.result);
      
      if (!effectiveResult) return;
      
      const t1Team = data.teams.find(t => t.name === m.t1);
      const t2Team = data.teams.find(t => t.name === m.t2);
      if (!t1Team || !t2Team) return;

      const s1 = results[t1Team.group]?.find(s => s.name === m.t1);
      const s2 = results[t2Team.group]?.find(s => s.name === m.t2);
      if (!s1 || !s2) return;

      s1.p++; s2.p++;
      const t1OversUsed = parseInt(m.t1Wickets) === 10 ? 20 : toDecimalOvers(m.t1Overs);
      const t2OversUsed = parseInt(m.t2Wickets) === 10 ? 20 : toDecimalOvers(m.t2Overs);

      s1.runsScored += parseInt(m.t1Runs || 0); s1.actualOversFaced += t1OversUsed;
      s1.runsConceded += parseInt(m.t2Runs || 0); s1.actualOversBowled += t2OversUsed;
      s2.runsScored += parseInt(m.t2Runs || 0); s2.actualOversFaced += t2OversUsed;
      s2.runsConceded += parseInt(m.t1Runs || 0); s2.actualOversBowled += t1OversUsed;

      if (effectiveResult === 't1') { s1.w++; s1.pts += 2; s2.l++; }
      else if (effectiveResult === 't2') { s2.w++; s2.pts += 2; s1.l++; }
      else { s1.d++; s1.pts += 1; s2.d++; s2.pts += 1; }
    });

    Object.keys(results).forEach(g => {
      results[g].forEach(team => {
        const forRate = team.actualOversFaced > 0 ? team.runsScored / team.actualOversFaced : 0;
        const againstRate = team.actualOversBowled > 0 ? team.runsConceded / team.actualOversBowled : 0;
        team.nrr = forRate - againstRate;
      });
      results[g].sort((a, b) => b.pts - a.pts || b.nrr - a.nrr || b.w - a.w || a.name.localeCompare(b.name));
    });
    return results;
  }, [data, user?.uid, isOwner]);

  // --- ACTIONS ---
  const generateSchedule = () => {
    const teamList = data.teams || [];
    if (teamList.length < 2) { alert("Add teams first."); return; }
    if (!window.confirm("Generate Round Robin schedule?")) return;
    const newGenerated = [];
    for (let i = 0; i < teamList.length; i++) {
      for (let j = i + 1; j < teamList.length; j++) {
        const matchExists = (data.matches || []).some(m => (m.t1 === teamList[i].name && m.t2 === teamList[j].name) || (m.t1 === teamList[j].name && m.t2 === teamList[i].name));
        if (!matchExists) newGenerated.push(createMatchObject(teamList[i].name, teamList[j].name));
      }
    }
    onUpdate({ ...data, matches: [...(data.matches || []), ...newGenerated] });
  };

  const addManualMatch = () => {
    if (!manualT1 || !manualT2 || manualT1 === manualT2) return;
    onUpdate({ ...data, matches: [...(data.matches || []), createMatchObject(manualT1, manualT2)] });
    setManualT1(''); setManualT2('');
  };

  const updateMatch = (matchId, field, value) => {
    const newMatches = (data.matches || []).map(m => m.id === matchId ? { ...m, [field]: value } : m);
    onUpdate({ ...data, matches: newMatches });
  };

  const handlePredictionUpdate = (matchId, selectedValue) => {
    const currentPredictions = data.predictions || {};
    const userPredictions = currentPredictions[user?.uid] || {};
    const nextValue = userPredictions[matchId] === selectedValue ? null : selectedValue;

    const updatedUserPredictions = { ...userPredictions, [matchId]: nextValue };

    onUpdate({
      ...data,
      predictions: {
        ...currentPredictions,
        [user?.uid]: updatedUserPredictions
      }
    });
  };

  const deleteMatch = (matchId) => {
    if (window.confirm("Delete this match?")) onUpdate({ ...data, matches: (data.matches || []).filter(m => m.id !== matchId) });
  };

  const inputStyle = { WebkitAppearance: 'none', MozAppearance: 'textfield', margin: 0 };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] overflow-hidden">
      <style>{`
        .no-spinner::-webkit-inner-spin-button, .no-spinner::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .compact-table th, .compact-table td { padding: 4px 8px; font-size: 10px; }
      `}</style>
      
      {/* MIDDLE PART: MATCHES & SEARCH (Scrollable) */}
      <div className="flex-1 overflow-y-auto px-2 space-y-4">
        
        {/* Only show Search and Admin Controls if sidebar isn't active (handling no data state) */}
        {!data && (
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4 space-y-3">
                <input 
                className="border p-2.5 rounded-xl text-xs bg-gray-50 w-full focus:outline-none focus:ring-1 focus:ring-blue-500" 
                placeholder="🔍 Search tournaments..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                />
                {filteredTournaments.length > 0 && (
                <div className="border border-gray-100 rounded-xl max-h-32 overflow-y-auto divide-y divide-gray-50 bg-white">
                    {filteredTournaments.map(t => (
                    <button key={t.id} onClick={() => { onUpdate(t); setSearchQuery(''); }} className="w-full text-left px-4 py-2 text-xs hover:bg-blue-50 font-bold text-gray-700 flex justify-between items-center">
                        <span>{t.name}</span>
                        <span className="text-[10px] text-blue-500 font-bold">Select</span>
                    </button>
                    ))}
                </div>
                )}
            </div>
        )}

        {!data ? (
          <div className="bg-white p-8 rounded-2xl border border-dashed border-gray-200 text-center flex flex-col justify-center items-center">
            <p className="text-sm font-bold text-gray-400 mb-2">No Tournament Selected</p>
            <p className="text-xs text-gray-400 max-w-xs">Search for a tournament to start predicting.</p>
          </div>
        ) : (
          <section className="space-y-3 pb-4">
            {isOwner && (
                <div className="bg-white p-3 rounded-xl border border-gray-100 space-y-3 mb-4 shadow-sm">
                   <div className="flex gap-2">
                        <input className="border p-2 rounded-lg text-xs bg-gray-50 flex-1" placeholder="Add Team Name..." value={teamInput} onChange={e => setTeamInput(e.target.value)} />
                        <button className="bg-blue-600 text-white px-4 rounded-lg font-bold" onClick={() => {
                        if (teamInput) onUpdate({ ...data, teams: [...(data.teams || []), { name: teamInput, group: selectedGroup, id: Date.now() }] });
                        setTeamInput('');
                        }}>+</button>
                    </div>
                </div>
            )}

            {sortedMatches.map((m) => {
  const allowedToInteract = canEditMatch(m.date);
  const userPredictions = data.predictions?.[user?.uid] || {};
  const currentActiveSelection = isOwner ? m.result : (userPredictions[m.id] !== undefined ? userPredictions[m.id] : null);

  return (
    <div key={m.id} className={`p-3 rounded-xl border transition-all bg-white shadow-sm border-gray-100 ${!allowedToInteract ? 'opacity-75' : ''}`}>
      
      {/* Top Meta Row: Date & Admin Delete */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          {isOwner ? (
            <input 
              type="date" 
              className="text-[10px] font-bold text-blue-600 bg-gray-50 px-1 rounded border-none outline-none" 
              value={m.date || ''} 
              onChange={e => updateMatch(m.id, 'date', e.target.value)} 
            />
          ) : (
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
              {m.date || 'TBD'}
            </span>
          )}
          {!allowedToInteract && !isOwner && (
            <span className="text-[9px] font-black text-amber-600 uppercase">🔒 Locked</span>
          )}
        </div>
        {isOwner && (
          <button onClick={() => deleteMatch(m.id)} className="text-gray-300 hover:text-red-500 transition-colors">
            🗑
          </button>
        )}
      </div>

      {/* Main Prediction Row: [Team 1] [Draw] [Team 2] */}
      <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-xl border border-gray-100">
        
        {/* Team 1 Button */}
        <button
          disabled={!allowedToInteract}
          onClick={() => isOwner ? updateMatch(m.id, 'result', m.result === 't1' ? null : 't1') : handlePredictionUpdate(m.id, 't1')}
          className={`flex-1 py-3 px-2 rounded-lg text-[11px] font-black transition-all truncate
            ${currentActiveSelection === 't1' 
              ? 'bg-blue-600 text-white shadow-md' 
              : 'bg-white text-gray-700 hover:bg-gray-100'
            }
            ${!allowedToInteract && !isOwner ? 'cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {m.t1.toUpperCase()}
        </button>

        {/* Draw Button */}
        <button
          disabled={!allowedToInteract}
          onClick={() => isOwner ? updateMatch(m.id, 'result', m.result === 'tie' ? null : 'tie') : handlePredictionUpdate(m.id, 'tie')}
          className={`px-3 py-3 rounded-lg text-[9px] font-black transition-all
            ${currentActiveSelection === 'tie' 
              ? 'bg-gray-800 text-white shadow-md' 
              : 'bg-white text-gray-400 hover:bg-gray-100 border border-gray-50'
            }
            ${!allowedToInteract && !isOwner ? 'cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          DRAW
        </button>

        {/* Team 2 Button */}
        <button
          disabled={!allowedToInteract}
          onClick={() => isOwner ? updateMatch(m.id, 'result', m.result === 't2' ? null : 't2') : handlePredictionUpdate(m.id, 't2')}
          className={`flex-1 py-3 px-2 rounded-lg text-[11px] font-black transition-all truncate
            ${currentActiveSelection === 't2' 
              ? 'bg-blue-600 text-white shadow-md' 
              : 'bg-white text-gray-700 hover:bg-gray-100'
            }
            ${!allowedToInteract && !isOwner ? 'cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {m.t2.toUpperCase()}
        </button>
      </div>

      {/* Admin Score Inputs (Only visible to Owner) */}
      {isOwner && (
        <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-gray-50">
          <div className="flex gap-1">
            <input type="number" placeholder="R" className="w-full p-1 border rounded text-[10px] text-center" value={m.t1Runs || ''} onChange={e => updateMatch(m.id, 't1Runs', e.target.value)} />
            <input type="number" placeholder="O" className="w-full p-1 border rounded text-[10px] text-center" value={m.t1Overs || ''} onChange={e => updateMatch(m.id, 't1Overs', e.target.value)} />
            <input type="number" placeholder="W" className="w-full p-1 border rounded text-[10px] text-center" value={m.t1Wickets || ''} onChange={e => updateMatch(m.id, 't1Wickets', e.target.value)} />
          </div>
          <div className="flex gap-1">
            <input type="number" placeholder="R" className="w-full p-1 border rounded text-[10px] text-center" value={m.t2Runs || ''} onChange={e => updateMatch(e.target.value)} value={m.t2Runs || ''} onChange={e => updateMatch(m.id, 't2Runs', e.target.value)} />
            <input type="number" placeholder="O" className="w-full p-1 border rounded text-[10px] text-center" value={m.t2Overs || ''} onChange={e => updateMatch(m.id, 't2Overs', e.target.value)} />
            <input type="number" placeholder="W" className="w-full p-1 border rounded text-[10px] text-center" value={m.t2Wickets || ''} onChange={e => updateMatch(m.id, 't2Wickets', e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
})}
          </section>
        )}
      </div>

      {/* BOTTOM PART: COMPACT STANDINGS */}
      {data && (
        <div className="bg-white border-t border-gray-200 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-center px-3 py-2 bg-gray-800 border-b border-gray-900">
             <h3 className="text-[10px] font-black text-gray-100 uppercase tracking-widest">Live Standings</h3>
             <p className="text-[10px] text-blue-400 font-black uppercase">{isOwner ? "Official" : "Predicted"}</p>
          </div>
          
          <div className="max-h-[240px] overflow-y-auto overflow-x-hidden">
            {Object.keys(groupStats).map(gName => (
              <div key={gName} className="px-1 pb-1">
                <table className="w-full text-left compact-table border-collapse table-fixed">
                  <thead className="sticky top-0 bg-white shadow-sm z-10">
                    <tr className="text-gray-500 uppercase border-b-2 border-gray-100">
                      <th className="w-1/2 font-black py-2 px-2 text-[9px]">Team</th>
                      <th className="w-[12%] text-center py-2 text-[9px]">P</th>
                      <th className="w-[18%] text-center text-blue-800 py-2 text-[10px] font-black">PTS</th>
                      <th className="w-[20%] text-right py-2 pr-3 text-[9px]">NRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupStats[gName].map((row, index) => (
                      <tr 
                        key={row.name} 
                        className={`
                          transition-colors border-b border-gray-100/50
                          ${index % 2 === 0 ? 'bg-gray-100/60' : 'bg-white'} 
                          hover:bg-blue-100/40
                        `}
                      >
                        <td className="font-black text-gray-900 truncate py-3 px-2">
                          <span className="text-[10px] text-gray-400 mr-2 inline-block w-4">{index + 1}</span>
                          {row.name.toUpperCase()}
                        </td>
                        <td className="text-center text-gray-900 font-black py-3">{row.p}</td>
                        <td className="text-center font-black text-blue-900 text-sm py-3">{row.pts}</td>
                        <td className={`text-right font-black py-3 pr-3 ${row.nrr >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {row.nrr.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TournamentEditor;