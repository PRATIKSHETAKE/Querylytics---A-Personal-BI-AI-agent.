import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Upload, Send, Loader2, Plus, 
  MessageSquare, Trash2, Menu, X, BarChart3, LayoutGrid, MessageCircle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Plotly from 'plotly.js-dist'; 
import createPlotlyComponent from 'react-plotly.js/factory';

const Plot = typeof createPlotlyComponent === 'function' 
  ? createPlotlyComponent(Plotly) 
  : createPlotlyComponent.default(Plotly);

// --- SECURE PROXY CONFIGURATION ---
const secureApi = axios.create({
  baseURL: "/api",
  headers: { "X-API-KEY": "your_secret_handshake_key_here" } 
});

const App = () => {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // NEW: State to handle Chat vs Gallery view
  const [viewMode, setViewMode] = useState("chat"); 

  const chatBottomRef = useRef(null);
  const activeSession = sessions.find(s => s.id === activeSessionId) || { chat: [], filename: "" };

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await secureApi.get("/sessions");
        if (res.data.length > 0) { 
          setSessions(res.data); 
          // Only set active if we don't already have one, prevents StrictMode jumping
          setActiveSessionId(prev => prev || res.data[0].id); 
        } else { 
          createNewSession(); 
        }
      } catch { 
        createNewSession(); 
      }
    };
    fetchHistory();
  }, []);

  useEffect(() => { 
    if (viewMode === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); 
    }
  }, [activeSession.chat, loading, viewMode]);

  const updateActiveSession = (newData) => {
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, ...newData } : s));
  };

  const createNewSession = () => {
    setSessions(prev => {
      // FIX: Prevent React StrictMode from creating double "ghost" sessions
      const emptyLocalExists = prev.find(s => s.name === "New Vault" && s.chat.length === 0);
      if (emptyLocalExists) {
        setActiveSessionId(emptyLocalExists.id);
        return prev;
      }
      const newId = `s_${Math.random().toString(36).slice(2, 7)}`;
      setActiveSessionId(newId);
      return [{ id: newId, name: "New Vault", chat: [], filename: "" }, ...prev];
    });
  };

  const deleteSession = async (e, id) => {
    e.stopPropagation();
    const sessionToDelete = sessions.find(s => s.id === id);
    
    // FIX: If it's a local ghost session (never uploaded to backend), just remove it locally without API 404
    const isLocalOnly = sessionToDelete && sessionToDelete.chat.length === 0 && !sessionToDelete.filename;

    try {
      if (!isLocalOnly) {
        await secureApi.delete(`/sessions/${id}`);
      }
      
      setSessions(prev => {
        const filtered = prev.filter(s => s.id !== id);
        if (filtered.length === 0) {
          const freshId = `s_${Math.random().toString(36).slice(2, 7)}`;
          setActiveSessionId(freshId);
          return [{ id: freshId, name: "New Vault", chat: [], filename: "" }];
        }
        return filtered;
      });

      if (activeSessionId === id) {
        setSessions(p => { setActiveSessionId(p[0]?.id); return p; });
      }
    } catch { 
      alert("Failed to delete session from server."); 
    }
  };

  const upload = async (e) => {
    const f = e.target.files[0];
    if (!f || !activeSessionId) return;
    const data = new FormData(); data.append("file", f);
    
    try {
      setLoading(true);
      const res = await secureApi.post(`/upload?session_id=${activeSessionId}`, data);
      
      updateActiveSession({ 
        filename: f.name, 
        name: res.data.name, // <-- Uses the 20-char LLM Title from the backend!
        chat: [
          { role: 'system', text: `Indexed: **${f.name}**` }, 
          { role: 'assistant', text: res.data.overview }
        ] 
      });
      setViewMode("chat"); 
    } catch (err) { 
      alert(`Upload Error: ${err.response?.data?.detail || "Check backend console"}`); 
    } finally { 
      setLoading(false); 
    }
  };

  const analyze = async () => {
    if (!query || !activeSession.filename) return;
    const q = query; setQuery(""); setLoading(true);
    const initialChat = [...activeSession.chat, { role: 'user', text: q }];
    updateActiveSession({ chat: initialChat });
    try {
      const res = await secureApi.post(`/analyze?query=${encodeURIComponent(q)}&filename=${activeSession.filename}&session_id=${activeSessionId}`);
      updateActiveSession({ chat: [...initialChat, { role: 'assistant', text: res.data.analysis, chart: res.data.graph_data }] });
    } catch { 
      updateActiveSession({ chat: [...initialChat, { role: 'assistant', text: "⚠️ Secure Logic Error." }] }); 
    } finally { 
      setLoading(false); 
    }
  };

  // Helper to extract all charts for the Gallery
  const galleryCharts = activeSession.chat.filter(m => m.chart);

  return (
    <div className="flex h-screen bg-[#072525] text-teal-50 font-sans overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className={`${isSidebarOpen ? 'w-72' : 'w-0'} bg-[#041a1a] flex flex-col transition-all duration-300 border-r border-teal-900/20 shadow-2xl z-20`}>
        <div className="p-6 flex items-center justify-between border-b border-teal-900/10">
          <span className="font-bold text-orange-500 text-xs tracking-widest uppercase">Vault History</span>
          <button onClick={createNewSession} className="p-2 bg-teal-900/20 hover:bg-orange-600 rounded-xl text-orange-500 hover:text-white transition"><Plus size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {sessions.map((s) => (
            <div key={s.id} onClick={() => setActiveSessionId(s.id)} className={`group flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all ${activeSessionId === s.id ? 'bg-[#0d3d3d] ring-1 ring-teal-700 shadow-xl' : 'hover:bg-teal-900/10 text-teal-700'}`}>
              <div className="flex items-center gap-3 truncate"><MessageSquare size={16} className={activeSessionId === s.id ? 'text-orange-500' : 'text-teal-900'} /><span className={`text-sm truncate font-medium ${activeSessionId === s.id ? 'text-white' : ''}`}>{s.name}</span></div>
              <button onClick={(e) => deleteSession(e, s.id)} className="opacity-0 group-hover:opacity-100 hover:text-orange-500 px-1 transition"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#072525]">
        
        {/* TOP NAVIGATION */}
        <nav className="flex items-center justify-between px-6 py-4 border-b border-teal-900/20 bg-[#072525]/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-teal-900/40 rounded-xl text-teal-600 transition">{isSidebarOpen ? <X size={22} /> : <Menu size={22} />}</button>
            <div className="flex items-center gap-3 text-white"><BarChart3 className="text-orange-500" /><span className="text-xl font-bold tracking-tight hidden md:block">Querylytics</span></div>
          </div>

          {/* NEW: View Toggle Switch */}
          <div className="flex bg-[#041a1a] p-1 rounded-xl border border-teal-900/30">
            <button onClick={() => setViewMode("chat")} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'chat' ? 'bg-teal-900/40 text-teal-50 shadow' : 'text-teal-600 hover:text-teal-300'}`}>
              <MessageCircle size={16} /> Chat
            </button>
            <button onClick={() => setViewMode("gallery")} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'gallery' ? 'bg-teal-900/40 text-teal-50 shadow' : 'text-teal-600 hover:text-teal-300'}`}>
              <LayoutGrid size={16} /> Gallery
            </button>
          </div>

          <label className="flex items-center gap-2 px-6 py-2.5 bg-orange-600 text-white rounded-full cursor-pointer hover:bg-orange-500 transition-all shadow-xl active:scale-95 border border-orange-400/20">
            <Upload size={18} /><span className="text-xs font-black uppercase tracking-widest hidden sm:block">{activeSession.filename || "Import"}</span>
            <input type="file" className="hidden" onChange={upload} accept=".csv,.xlsx" />
          </label>
        </nav>

        {/* DYNAMIC CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-6 md:px-12 lg:px-32 space-y-8">
          
          {/* VIEW: CHAT */}
          {viewMode === "chat" && activeSession.chat.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[95%] w-full md:w-auto p-6 rounded-3xl shadow-2xl border ${m.role === 'user' ? 'bg-orange-600 text-white border-orange-500 rounded-tr-none' : m.role === 'system' ? 'bg-teal-900/10 text-teal-800 text-center mx-auto text-[10px] px-8 border-teal-900/20' : 'bg-[#0f3636] border-teal-800/30 text-teal-50 rounded-tl-none'}`}>
                <div className="markdown-content text-sm md:text-base leading-relaxed overflow-x-auto">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                </div>

                {/* FIX: Removed the buggy background loader, relies on Plotly's instant rendering */}
                {m.chart && (
                  <div className="mt-6 bg-[#041a1a] rounded-2xl p-2 md:p-4 border border-teal-800/20 shadow-inner overflow-hidden min-h-[450px]">
                    <Plot
                      data={m.chart.data}
                      useResizeHandler={true}
                      className="w-full h-full"
                      layout={{
                        ...m.chart.layout,
                        autosize: true, width: undefined, height: 450,
                        mapbox: { ...(m.chart.layout?.mapbox || {}), style: "open-street-map" },
                        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                        font: { color: '#a3cccc' }, margin: { t: 40, b: 40, l: 0, r: 0 }
                      }}
                      config={{ ...m.chart.config, displayModeBar: true, responsive: true, displaylogo: false }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* VIEW: GALLERY */}
          {viewMode === "gallery" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 pb-10">
              {galleryCharts.length === 0 ? (
                 <div className="col-span-full text-center text-teal-700 py-20 font-medium tracking-wide">No graphs generated in this vault yet.</div>
              ) : (
                galleryCharts.map((m, i) => (
                  <div key={i} className="bg-[#0f3636] rounded-3xl p-4 border border-teal-800/30 shadow-2xl hover:border-teal-600/50 transition-colors">
                    <div className="text-xs text-teal-600 mb-2 font-bold px-2 truncate uppercase tracking-wider">{activeSession.filename} - Chart {i + 1}</div>
                    <div className="bg-[#041a1a] rounded-2xl border border-teal-800/20 shadow-inner overflow-hidden min-h-[350px]">
                      <Plot
                        data={m.chart.data} useResizeHandler={true} className="w-full h-full"
                        layout={{ ...m.chart.layout, autosize: true, width: undefined, height: 350, mapbox: { ...(m.chart.layout?.mapbox || {}), style: "open-street-map" }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { color: '#a3cccc' }, margin: { t: 40, b: 20, l: 0, r: 0 } }}
                        config={{ displayModeBar: false, responsive: true, displaylogo: false }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {loading && viewMode === "chat" && (
            <div className="flex items-center gap-3 text-orange-500 font-bold text-xs animate-pulse ml-2">
              <Loader2 className="animate-spin" size={16} /> GENERATING INSIGHTS...
            </div>
          )}
          {viewMode === "chat" && <div ref={chatBottomRef} />}
        </div>

        {/* INPUT BAR */}
        {viewMode === "chat" && (
          <div className="p-6 bg-[#072525] border-t border-teal-900/10">
            <div className="flex gap-3 max-w-5xl mx-auto bg-[#0a2e2e] p-2.5 rounded-3xl border border-teal-800/30 shadow-inner focus-within:ring-2 ring-orange-500/50 transition-all duration-300">
              <input value={query} onChange={e => setQuery(e.target.value)} onKeyPress={e => e.key === 'Enter' && analyze()}
                className="flex-1 bg-transparent px-5 py-2 outline-none text-white placeholder:text-teal-900 disabled:cursor-not-allowed"
                placeholder={activeSession.filename ? "Query this dataset..." : "Import data to begin..."}
                disabled={!activeSession.filename || loading}
              />
              <button onClick={analyze} disabled={!query || loading}
                className="p-4 bg-orange-600 text-white rounded-2xl hover:bg-orange-500 shadow-lg active:scale-90 transition-all">
                <Send size={22} />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
