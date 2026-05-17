import { useState, useEffect } from 'react';
import { 
  Film, 
  Settings, 
  Layout, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  ExternalLink,
  Calendar,
  Star,
  Tags,
  Loader2,
  RefreshCw,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

interface Post {
  id: string;
  imdbId: string;
  movieTitle: string;
  seoTitle: string;
  metaDescription: string;
  slug: string;
  tags: string[];
  articleHtml: string;
  posterPath: string;
  releaseDate: string;
  rating: number;
  genres: string;
  cast: string;
  publishedAt: string;
  status: string;
}

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'posts' | 'settings'>('dashboard');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [omdbKey, setOmdbKey] = useState('');
  const [adCode, setAdCode] = useState('');
  const [isAutoPostEnabled, setIsAutoPostEnabled] = useState(false);
  const [isBloggerConnected, setIsBloggerConnected] = useState(false);
  const [connectedBlogName, setConnectedBlogName] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [publishingToBlogger, setPublishingToBlogger] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.omdb?.apiKey) setOmdbKey(data.omdb.apiKey);
      if (data.ads?.adCode) setAdCode(data.ads.adCode);
      setIsBloggerConnected(data.blog?.isConnected || false);
      setConnectedBlogName(data.blog?.blogName || '');
      setIsAutoPostEnabled(data.blog?.isAutoPostEnabled || false);
    } catch (err) {
      console.error('Failed to fetch settings', err);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          omdb: { apiKey: omdbKey },
          ads: { adCode },
          isAutoPostEnabled
        })
      });
      if (res.ok) {
        setError(null);
      }
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleConnectBlogger = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      const { url } = await response.json();
      const authWindow = window.open(url, 'blogger_auth', 'width=600,height=700');
      
      if (!authWindow) {
        setError('Popup blocked. Please allow popups to connect Blogger.');
      }
    } catch (err) {
      setError('Failed to start Blogger connection.');
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchSettings();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleManualBloggerPublish = async (postId: string) => {
    setPublishingToBlogger(postId);
    try {
      const res = await fetch(`/api/posts/${postId}/publish-blogger`, { method: 'POST' });
      if (res.ok) {
        fetchPosts();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to publish to Blogger');
      }
    } catch (err) {
      setError('Blogger publish request failed');
    } finally {
      setPublishingToBlogger(null);
    }
  };

  const fetchPosts = async () => {
    try {
      const res = await fetch('/api/posts');
      const data = await res.json();
      if (Array.isArray(data)) {
        setPosts(data);
      } else if (data && typeof data === 'object' && 'error' in data) {
        setError(data.error);
        setPosts([]);
      } else {
        setPosts([]);
      }
    } catch (err) {
      console.error('Failed to fetch posts', err);
      setError('Failed to connect to the recording server.');
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
    fetchSettings();
  }, []);

  const runAutomation = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/automation/run', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success' || data.status === 'skipped') {
        fetchPosts();
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError('Connection failed. Is the server running?');
    } finally {
      setRunning(false);
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Layout },
    { id: 'posts', label: 'All Posts', icon: Film },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen bg-white p-6 md:p-12">
      <div className="min-h-[calc(100vh-6rem)] bg-[#FCFAF7] text-[#1A1A1A] font-sans selection:bg-[#FF6321]/20 flex flex-col md:flex-row relative border border-black/5 shadow-2xl shadow-black/10 overflow-hidden">
        
        {/* Sidebar / Nav */}
        <nav className="w-full md:w-72 bg-transparent border-b md:border-b-0 md:border-r border-black/10 z-50 flex flex-col p-8 lg:p-10">
          <div className="mb-16">
            <h1 className="text-3xl font-serif italic tracking-tight leading-none mb-2">CineFlow</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-40">AI Content Pipeline</p>
          </div>

          <div className="flex-1 space-y-8">
            <div className="space-y-4">
              <p className="text-[10px] uppercase tracking-widest font-black opacity-30 mb-4">Management</p>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSelectedPost(null);
                  }}
                  className={cn(
                    "w-full flex items-center gap-4 py-2 transition-all duration-300 group relative text-left",
                    activeTab === tab.id 
                      ? "text-[#FF6321]" 
                      : "text-[#1A1A1A] hover:translate-x-2"
                  )}
                >
                  <tab.icon className={cn("w-4 h-4", activeTab === tab.id ? "text-[#FF6321]" : "opacity-40")} />
                  <span className={cn("font-serif italic text-xl", activeTab === tab.id ? "" : "opacity-70")}>{tab.label}</span>
                  {activeTab === tab.id && (
                    <motion.div 
                      layoutId="activeTabIndicator"
                      className="absolute -left-10 w-1 h-6 bg-[#FF6321]"
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="pt-8 border-t border-black/5 space-y-4">
              <p className="text-[10px] uppercase tracking-widest font-black opacity-30 mb-4">Operations</p>
              <button 
                onClick={runAutomation}
                disabled={running}
                className="w-full flex items-center justify-between group"
              >
                <div className="flex items-center gap-4">
                  <Play className={cn("w-4 h-4", running ? "animate-spin text-[#FF6321]" : "fill-current")} />
                  <span className="font-serif italic text-xl whitespace-nowrap">{running ? "Processing..." : "Manual Run"}</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
              </button>
            </div>
          </div>

          {/* Footer Info */}
          <div className="mt-12 space-y-4 pt-8 border-t border-black/5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest opacity-40">
              <span>Status</span>
              <span className="text-[#FF6321]">Active</span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest opacity-40">
              <span>Sync</span>
              <span>100%</span>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-8 lg:p-20 scrollbar-hide">
          <div className="max-w-6xl mx-auto">
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-12 p-6 bg-[#FF6321]/5 border border-[#FF6321]/20 rounded-sm flex items-center gap-4 text-[#FF6321]"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="font-serif italic text-lg">{error}</p>
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' && (
                <motion.div 
                  key="dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-12 gap-12"
                >
                  {/* Left Hub */}
                  <div className="col-span-12 lg:col-span-8 space-y-16">
                    <header className="space-y-4">
                      <p className="text-[10px] uppercase tracking-[0.3em] font-black opacity-30">Phase 01 / Overview</p>
                      <h2 className="text-7xl font-serif italic tracking-tighter leading-none">Journal of Automated Records</h2>
                      <p className="text-xl text-black/60 max-w-xl font-medium leading-relaxed italic">
                        Documenting the autonomous cinematic observations generated by Gemini AI.
                      </p>
                    </header>

                    <div className="grid grid-cols-2 gap-px bg-black/5 border border-black/5">
                      <div className="bg-[#FCFAF7] p-8">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Total Archives</p>
                        <h3 className="text-6xl font-serif">{posts.length}</h3>
                      </div>
                      <div className="bg-[#FCFAF7] p-8">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Success Index</p>
                        <h3 className="text-6xl font-serif italic text-[#FF6321]">100%</h3>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="flex items-end justify-between border-b border-black/10 pb-4">
                        <h3 className="text-2xl font-serif italic">Recent Broadcasts</h3>
                        <button onClick={fetchPosts} className="text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity flex items-center gap-2">
                          <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
                          Sync Records
                        </button>
                      </div>

                      <div className="divide-y divide-black/5">
                        {posts.slice(0, 5).map((post) => (
                          <div 
                            key={post.id} 
                            onClick={() => {
                              setSelectedPost(post);
                              setActiveTab('posts');
                            }}
                            className="group py-6 flex items-center justify-between cursor-pointer hover:bg-black/[0.02] transition-colors -mx-4 px-4"
                          >
                            <div className="flex items-center gap-8">
                              <span className="text-xs font-mono opacity-20 group-hover:opacity-100 transition-opacity">0{posts.indexOf(post) + 1}</span>
                              <div>
                                <h4 className="text-2xl font-serif group-hover:italic transition-all leading-tight">{post.movieTitle}</h4>
                                <div className="flex items-center gap-4 mt-1">
                                  <span className="text-[10px] font-black uppercase tracking-widest opacity-30">{new Date(post.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric'})}</span>
                                  <span className="w-1 h-1 bg-[#FF6321] rounded-full" />
                                  <span className="text-[10px] font-black uppercase tracking-widest opacity-30 italic">⭐ {post.rating}</span>
                                </div>
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-40 transition-all -translate-x-4 group-hover:translate-x-0" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Rail */}
                  <div className="col-span-12 lg:col-span-4 space-y-12">
                    <div className="border border-black/10 p-8 rounded-sm space-y-8 bg-white/50">
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-[0.2em] font-black opacity-30">The Engine</p>
                        <h4 className="text-xl font-serif font-black">24h Cycle</h4>
                      </div>
                      <div className="space-y-6">
                        <div className="flex items-start gap-4">
                          <div className="w-1.5 h-1.5 bg-[#FF6321] mt-1.5 shrink-0" />
                          <div className="text-sm font-medium opacity-70">Daily trending scan at 08:00 AM UTC.</div>
                        </div>
                        <div className="flex items-start gap-4">
                          <div className="w-1.5 h-1.5 bg-[#FF6321] mt-1.5 shrink-0" />
                          <div className="text-sm font-medium opacity-70">Duplicate prevention via IMDb ID check.</div>
                        </div>
                        <div className="flex items-start gap-4">
                          <div className="w-1.5 h-1.5 bg-[#FF6321] mt-1.5 shrink-0" />
                          <div className="text-sm font-medium opacity-70">Gemini 1.5 Flash editorial generation.</div>
                        </div>
                      </div>
                      <div className="pt-8 border-t border-black/5">
                        <div className="bg-[#1D1D1F] text-white p-4 font-mono text-[10px] leading-relaxed">
                          <div className="text-[#FF6321]">system_state: operational</div>
                          <div className="opacity-50">last_sync: {new Date().toLocaleTimeString()}</div>
                          <div className="opacity-50">archives_locked: true</div>
                        </div>
                      </div>
                    </div>

                    <div className="p-8 space-y-6">
                      <h4 className="text-xs font-black uppercase tracking-widest opacity-30">Current Stack</h4>
                      <div className="space-y-4">
                        <div className="flex justify-between items-end border-b border-black/5 pb-2">
                          <span className="text-sm font-serif italic text-black/60">Intelligence</span>
                          <span className="text-[10px] font-bold">Gemini 1.5</span>
                        </div>
                        <div className="flex justify-between items-end border-b border-black/5 pb-2">
                          <span className="text-sm font-serif italic text-black/60">Source</span>
                          <span className="text-[10px] font-bold">OMDb</span>
                        </div>
                        <div className="flex justify-between items-end border-b border-black/5 pb-2">
                          <span className="text-sm font-serif italic text-black/60">Database</span>
                          <span className="text-[10px] font-bold">Firestore</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'posts' && (
                <motion.div 
                  key="posts"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {selectedPost ? (
                    <div className="animate-in fade-in duration-700">
                      <button 
                        onClick={() => setSelectedPost(null)}
                        className="mb-16 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest opacity-30 hover:opacity-100 transition-opacity"
                      >
                        <ChevronRight className="w-3 h-3 rotate-180" />
                        Return to Archives
                      </button>

                      <article className="grid grid-cols-12 gap-12 lg:gap-20">
                        <div className="col-span-12 lg:col-span-8">
                          <header className="mb-20 space-y-8">
                            <div className="flex flex-wrap gap-4 text-[10px] font-black uppercase tracking-widest text-[#FF6321]">
                              {selectedPost.tags.map(tag => (
                                <span key={tag}>#{tag}</span>
                              ))}
                            </div>
                            <h2 className="text-8xl font-serif italic tracking-tighter leading-[0.95]">{selectedPost.movieTitle}</h2>
                            <div className="pt-8 border-t border-black/10 flex items-center gap-8">
                              <div className="text-[10px] font-black uppercase tracking-widest opacity-30">Dispatch Date <span className="block text-black opacity-100 mt-1">{new Date(selectedPost.publishedAt).toLocaleDateString()}</span></div>
                              <div className="text-[10px] font-black uppercase tracking-widest opacity-30">Review Quality <span className="block text-black opacity-100 mt-1">{selectedPost.rating}/10</span></div>
                              <div className="text-[10px] font-black uppercase tracking-widest opacity-30">Content Type <span className="block text-black opacity-100 mt-1">Autonomous</span></div>
                            </div>
                          </header>

                          <div 
                            className="prose prose-xl prose-stone max-w-none prose-headings:font-serif prose-headings:italic prose-p:text-black/80 prose-p:leading-relaxed prose-strong:text-black" 
                            dangerouslySetInnerHTML={{ __html: selectedPost.articleHtml }} 
                          />
                        </div>

                        <div className="col-span-12 lg:col-span-4">
                          <div className="sticky top-12 space-y-12">
                            <figure className="relative group">
                              <img 
                                src={selectedPost.posterPath || "https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=780&auto=format&fit=crop"} 
                                className="w-full grayscale hover:grayscale-0 transition-all duration-1000 border border-black/10"
                                alt={selectedPost.movieTitle}
                              />
<figcaption className="mt-4 text-[10px] uppercase font-bold tracking-widest opacity-40 italic">
                                Fig 1. Official OMDb Visual Asset
                              </figcaption>
                            </figure>

                            <div className="border border-black/10 p-10 space-y-8 bg-white/50">
                              <h4 className="text-xs font-black uppercase tracking-widest opacity-30 italic">Meta Info</h4>
                              <div className="space-y-6">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 mb-2">Starring</p>
                                  <p className="font-serif italic text-lg leading-snug">{selectedPost.cast}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 mb-2">Genres</p>
                                  <p className="font-serif italic text-lg leading-snug">{selectedPost.genres}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    </div>
                  ) : (
                    <div className="space-y-16">
                      <header className="space-y-4">
                        <p className="text-[10px] uppercase tracking-[0.3em] font-black opacity-30">Phase 02 / Archives</p>
                        <h2 className="text-7xl font-serif italic tracking-tighter leading-none">The Recorded Timeline</h2>
                      </header>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-16 gap-x-12">
                        {posts.map(post => (
                          <div 
                            key={post.id} 
                            onClick={() => setSelectedPost(post)}
                            className="group cursor-pointer space-y-6"
                          >
                            <div className="aspect-[3/4] overflow-hidden border border-black/10 grayscale group-hover:grayscale-0 transition-all duration-700">
                              <img 
                                src={post.posterPath || "https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=500&auto=format&fit=crop"} 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000"
                                alt={post.movieTitle}
                              />
                            </div>
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest opacity-30">
                                  <span>{new Date(post.publishedAt).getFullYear()}</span>
                                  <span className="w-1 h-1 bg-[#FF6321] rounded-full" />
                                  <span>⭐ {post.rating}</span>
                                </div>
                                {post.bloggerPostId ? (
                                  <span className="text-[9px] font-black uppercase tracking-widest text-[#FF6321] bg-[#FF6321]/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    Synced <ExternalLink className="w-2.5 h-2.5" />
                                  </span>
                                ) : isBloggerConnected ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleManualBloggerPublish(post.id);
                                    }}
                                    disabled={publishingToBlogger === post.id}
                                    className="text-[9px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 hover:text-[#FF6321] transition-all bg-black/5 hover:bg-black/10 px-2 py-0.5 rounded-full"
                                  >
                                    {publishingToBlogger === post.id ? "Syncing..." : "Sync Blogger"}
                                  </button>
                                ) : null}
                              </div>
                              <h3 className="text-3xl font-serif leading-tight group-hover:italic transition-all">{post.movieTitle}</h3>
                              <p className="text-sm text-black/50 line-clamp-2 italic leading-relaxed">{post.metaDescription}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'settings' && (
                <motion.div 
                  key="settings"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="max-w-4xl space-y-20"
                >
                  <header className="space-y-4">
                    <p className="text-[10px] uppercase tracking-[0.3em] font-black opacity-30">Phase 03 / Core Settings</p>
                    <h2 className="text-7xl font-serif italic tracking-tighter leading-none">The Machine Blueprint</h2>
                  </header>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-12">
                      <div className="space-y-12">
                        <h4 className="text-xs font-black uppercase tracking-widest border-b border-black/10 pb-4">API Configuration</h4>
                        
                        <div className="space-y-8">
                          <div className="flex flex-col gap-4">
                            <div className="flex justify-between items-baseline">
                              <span className="font-serif italic text-xl">OMDb API Key</span>
                              <span className={cn("text-[10px] font-black uppercase tracking-widest", omdbKey ? "text-green-600" : "text-[#FF6321]")}>
                                {omdbKey ? "Active" : "Required"}
                              </span>
                            </div>
                            <input 
                              type="password" 
                              value={omdbKey}
                              onChange={(e) => setOmdbKey(e.target.value)}
                              placeholder="Enter OMDb API Key..."
                              className="w-full bg-white border border-black/10 px-4 py-3 text-sm font-serif italic focus:outline-none focus:border-[#FF6321] transition-colors"
                            />
                          </div>

                          <div className="flex flex-col gap-4">
                            <div className="flex justify-between items-baseline">
                              <span className="font-serif italic text-xl">Blogger Connection</span>
                              <span className={cn("text-[10px] font-black uppercase tracking-widest", isBloggerConnected ? "text-green-600" : "text-[#FF6321]")}>
                                {isBloggerConnected ? "Connected" : "Disconnected"}
                              </span>
                            </div>
                            {isBloggerConnected ? (
                              <div className="space-y-4">
                                <div className="p-4 bg-green-50 border border-green-200 rounded-sm">
                                  <p className="text-xs text-green-800 font-serif italic">
                                    Currently posting to: <strong>{connectedBlogName}</strong>
                                  </p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <input 
                                    type="checkbox" 
                                    id="auto-post"
                                    checked={isAutoPostEnabled}
                                    onChange={(e) => setIsAutoPostEnabled(e.target.checked)}
                                    className="w-4 h-4 accent-[#FF6321]"
                                  />
                                  <label htmlFor="auto-post" className="text-xs font-black uppercase tracking-widest cursor-pointer">
                                    Enable Auto-Post (Every 6 Hours)
                                  </label>
                                </div>
                              </div>
                            ) : (
                              <button 
                                onClick={handleConnectBlogger}
                                className="w-full bg-[#1A1A1A] text-white px-6 py-4 text-xs font-black uppercase tracking-widest hover:bg-[#FF6321] transition-all flex items-center justify-center gap-3"
                              >
                                <Plus className="w-4 h-4" />
                                Connect Blogger
                              </button>
                            )}
                          </div>

                          <div className="flex flex-col gap-4">
                            <div className="flex justify-between items-baseline">
                              <span className="font-serif italic text-xl">Adsterra Ad Code</span>
                              <span className="text-[10px] font-black uppercase tracking-widest opacity-40 italic">Optional</span>
                            </div>
                            <textarea 
                              value={adCode}
                              onChange={(e) => setAdCode(e.target.value)}
                              placeholder="Paste Adsterra tag here..."
                              rows={4}
                              className="w-full bg-white border border-black/10 px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#FF6321] transition-colors resize-none"
                            />
                            <p className="text-[10px] text-black/40 italic leading-relaxed">
                              This code will be injected at both the beginning and end of each blog post automatically. Use Adsterra Social Bar or Popunder tags for best results.
                            </p>
                          </div>

                          <div className="pt-8 border-t border-black/10">
                            <h4 className="text-xs font-black uppercase tracking-widest mb-6">Deployment & Blogger Help</h4>
                            <div className="bg-black/5 p-6 space-y-6 rounded-sm border border-black/5">
                              <div className="space-y-4">
                                <h5 className="text-[10px] font-black uppercase tracking-widest text-[#FF6321]">1. Google Auth Troubleshooting</h5>
                                <div className="p-4 bg-white border border-black/5 rounded-sm space-y-3">
                                  <p className="text-[10px] font-bold">Access Blocked / 403 Access Denied?</p>
                                  <p className="text-[10px] leading-relaxed opacity-70">
                                    Your Google Cloud Project is likely in <strong>"Testing"</strong> mode. You must:
                                    <br/>â€¢ Go to <strong>Google Cloud Console</strong> &rarr; <strong>APIs & Services</strong> &rarr; <strong>OAuth Consent Screen</strong>.
                                    <br/>â€¢ Under <strong>"Test users"</strong>, click <strong>"+ ADD USERS"</strong> and add your email: <strong>{localStorage.getItem('userEmail') || 'your-email@gmail.com'}</strong>.
                                    <br/>â€¢ Or click <strong>"PUBLISH APP"</strong> to move to production.
                                  </p>
                                </div>
                              </div>

                              <div className="space-y-4">
                                <h5 className="text-[10px] font-black uppercase tracking-widest text-[#FF6321]">2. Vercel / GitHub Environment Variables</h5>
                                <div className="p-4 bg-white border border-black/5 rounded-sm space-y-4">
                                  <p className="text-[10px] leading-relaxed opacity-70">
                                    Add these <strong>Environmental Variables</strong> in your Vercel/Hosting dashboard:
                                  </p>
                                  <div className="grid grid-cols-1 gap-2">
                                    {[
                                      'GOOGLE_CLIENT_ID',
                                      'GOOGLE_CLIENT_SECRET',
                                      'GEMINI_API_KEY',
                                      'OMDB_API_KEY',
                                      'APP_URL (e.g. https://your-site.vercel.app)',
                                      '--- Firebase Vars (From firebase-applet-config.json) ---',
                                      'FIREBASE_PROJECT_ID',
                                      'FIREBASE_API_KEY',
                                      'FIREBASE_AUTH_DOMAIN',
                                      'FIREBASE_APP_ID'
                                    ].map(key => (
                                      <div key={key} className="flex justify-between items-center bg-black/[0.02] px-2 py-1.5 border border-black/5">
                                        <code className="text-[9px] font-mono">{key}</code>
                                        <span className="text-[8px] font-black opacity-20 uppercase">Required</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              <div>
                                <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">Authorized Redirect URI (for Google Console)</p>
                                <div className="flex items-center gap-2">
                                  <code className="bg-white px-3 py-1.5 border border-black/10 text-[10px] flex-1 font-mono">{window.location.origin}/auth/callback</code>
                                  <button 
                                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/auth/callback`)}
                                    className="text-[9px] font-black uppercase hover:text-[#FF6321]"
                                  >
                                    Copy
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          <button 
                            onClick={saveSettings}
                            disabled={savingSettings}
                            className="w-full bg-[#FF6321] text-white px-6 py-4 text-xs font-black uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50"
                          >
                            {savingSettings ? "Applying Changes..." : "Sync All Settings"}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-12 bg-black text-white p-10 rounded-sm">
                      <h4 className="text-xs font-black uppercase tracking-widest opacity-40 mb-8 border-b border-white/10 pb-4">Logic Constraints</h4>
                      <ul className="space-y-6">
                        <li className="flex gap-6">
                          <span className="text-xs font-mono opacity-30">01</span>
                          <div className="text-sm italic opacity-80 leading-relaxed">System strictly forbids duplicate entries via IMDb ID verification in secondary storage.</div>
                        </li>
                        <li className="flex gap-6">
                          <span className="text-xs font-mono opacity-30">02</span>
                          <div className="text-sm italic opacity-80 leading-relaxed">Content is generated with a high temperature (0.85) to ensure human-sounding patterns.</div>
                        </li>
                        <li className="flex gap-6">
                          <span className="text-xs font-mono opacity-30">03</span>
                          <div className="text-sm italic opacity-80 leading-relaxed">Images are fetched directly from OMDb or fallback providers for optimal display quality.</div>
                        </li>
                      </ul>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
