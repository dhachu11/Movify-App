import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import admin from "firebase-admin";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { initializeApp as initializeClientApp } from "firebase/app";
import { 
  getFirestore as getClientFirestore, 
  collection as clientCollection, 
  getDocs as clientGetDocs, 
  limit as clientLimit, 
  query as clientQuery, 
  doc as clientDoc, 
  addDoc as clientAddDoc, 
  getDoc as clientGetDoc, 
  setDoc as clientSetDoc, 
  orderBy as clientOrderBy 
} from "firebase/firestore";
import { readFileSync } from "fs";
import { google } from "googleapis";

// Load Firebase Config
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  firebaseConfig = JSON.parse(readFileSync(configPath, "utf-8"));
} catch (e) {
  // If local file is missing (e.g. in Vercel), fallback to env vars
  firebaseConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || "(default)"
  };
}

// Google OAuth Setup
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 
                     (process.env.APP_URL ? `${process.env.APP_URL}/auth/callback` : "http://localhost:3000/auth/callback");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

console.log(`[OAuth] Redirect URI initialized as: ${REDIRECT_URI}`);

// Global DB State
let db: any = null;
let isClientDb = false;
let lastInitError: any = null;
let strategyErrors: any[] = [];
let memoryPosts: any[] = [];
let schedulerInterval: NodeJS.Timeout | null = null;

// Background Scheduler
async function runAutoAutomation() {
  console.log("[Scheduler] Checking for auto-post trigger...");
  try {
    const settings = await getDocument("settings", "blog_config");
    if (!settings?.isAutoPostEnabled) {
      console.log("[Scheduler] Auto-post is disabled.");
      return;
    }

    // Check last run to avoid excessive calls on server restart
    const now = Date.now();
    const lastRun = settings.lastAutoRun || 0;
    const intervalMs = 6 * 60 * 60 * 1000; // 6 hours

    if (now - lastRun < intervalMs) {
      console.log("[Scheduler] Still too early for next auto-post.");
      return;
    }

    console.log("[Scheduler] Starting automatic post generation...");
    // Mock a request to the automation endpoint
    let OMDB_KEY = process.env.OMDB_API_KEY;
    const omdbSettings = await getDocument("settings", "omdb_config");
    if (omdbSettings?.apiKey) OMDB_KEY = omdbSettings.apiKey;

    if (!OMDB_KEY) throw new Error("OMDB Key missing");

    const years = ["2024", "2023", "2025"];
    const year = years[Math.floor(Math.random() * years.length)];
    const r = await fetch(`http://www.omdbapi.com/?apikey=${OMDB_KEY}&s=movie&y=${year}&type=movie`);
    const data = await r.json();
    const movie = data.Search?.[Math.floor(Math.random() * data.Search.length)];
    if (!movie) throw new Error("No movies found");

    const dr = await fetch(`http://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${movie.imdbID}&plot=full`);
    const details = await dr.json();
    
    await generateBlogPost(details);
    
    // Update last run time
    await setDocument("settings", "blog_config", { ...settings, lastAutoRun: now });
    console.log("[Scheduler] Auto-post successful.");
  } catch (error: any) {
    console.error("[Scheduler] Error:", error.message);
  }
}

function setupScheduler() {
  if (process.env.VERCEL) {
    console.log("[Scheduler] Running on Vercel, skipping background interval.");
    return;
  }
  if (schedulerInterval) clearInterval(schedulerInterval);
  // Run check every 10 minutes
  schedulerInterval = setInterval(runAutoAutomation, 10 * 60 * 1000);
  // Also run once on start
  runAutoAutomation();
}

async function initFirebase() {
  if (db) return;
  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId;
  strategyErrors = [];

  if (!projectId) {
    console.warn("[Firebase] No Project ID provided. Database features will be limited.");
    return;
  }

  // Strategy A: Admin SDK
  async function tryAdminConnect(options: admin.AppOptions, dbId: string | undefined, name: string) {
    try {
      console.log(`[Firebase] Trying Admin Strategy: ${name}...`);
      if (admin.apps.length) await Promise.all(admin.apps.map(a => a?.delete().catch(() => {})));
      const app = admin.initializeApp(options);
      const testDb = (dbId === "(default)" || !dbId) ? getAdminFirestore(app) : getAdminFirestore(app, dbId);
      await testDb.collection('_health').limit(1).get();
      db = testDb;
      isClientDb = false;
      console.log(`[Firebase] Admin Strategy ${name} SUCCESS.`);
      return true;
    } catch (e: any) {
      console.warn(`[Firebase] Admin Strategy ${name} FAILED: ${e.message}`);
      strategyErrors.push({ strategy: name, error: e.message });
      return false;
    }
  }

  // Strategy B: Client SDK (Fallback)
  async function tryClientConnect() {
    try {
      console.log(`[Firebase] Trying Client SDK Strategy...`);
      const app = initializeClientApp(firebaseConfig);
      const testDb = getClientFirestore(app, databaseId);
      await clientGetDocs(clientQuery(clientCollection(testDb, "_health"), clientLimit(1)));
      db = testDb;
      isClientDb = true;
      console.log(`[Firebase] Client SDK Strategy SUCCESS.`);
      return true;
    } catch (e: any) {
      console.warn(`[Firebase] Client SDK Strategy FAILED: ${e.message}`);
      strategyErrors.push({ strategy: "Client SDK", error: e.message });
      return false;
    }
  }

  const adminStrategies = [
    { options: { projectId }, dbId: databaseId, name: "Admin (Config+Config)" },
    { options: { projectId }, dbId: "(default)", name: "Admin (Config+Default)" },
    { options: {}, dbId: databaseId, name: "Admin (Naked+Config)" },
    { options: {}, dbId: "(default)", name: "Admin (Naked+Default)" }
  ];

  for (const s of adminStrategies) {
    if (await tryAdminConnect(s.options, s.dbId, s.name)) {
      lastInitError = null;
      return;
    }
  }

  if (await tryClientConnect()) {
    lastInitError = null;
    return;
  }

  console.error("[Firebase] ALL STRATEGIES FAILED.");
  lastInitError = strategyErrors[strategyErrors.length - 1]?.error || "Unknown Error";
}

// Blogger Helper
async function publishToBlogger(title: string, content: string, labels: string[]) {
  try {
    const settings = await getDocument("settings", "blog_config");
    if (!settings?.tokens || !settings?.blogId) {
      console.warn("[Blogger] Not configured, skipping publish.");
      return null;
    }

    oauth2Client.setCredentials(settings.tokens);
    const blogger = google.blogger({ version: "v3", auth: oauth2Client });
    
    const res = await blogger.posts.insert({
      blogId: settings.blogId,
      requestBody: {
        title,
        content,
        labels,
      }
    });

    console.log("[Blogger] Published post:", res.data.id);
    return res.data.id;
  } catch (error: any) {
    console.error("[Blogger] Publish error:", error.message);
    throw error;
  }
}

// Abstraction Helpers
async function getCollection(path: string, options: { orderBy?: string, limit?: number } = {}) {
  await initFirebase();
  if (!db) throw new Error("Database not initialized");
  if (isClientDb) {
    let q = clientCollection(db, path) as any;
    if (options.orderBy) q = clientQuery(q, clientOrderBy(options.orderBy, "desc"));
    if (options.limit) q = clientQuery(q, clientLimit(options.limit));
    const snap = await clientGetDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as object) }));
  } else {
    let q = db.collection(path);
    if (options.orderBy) q = q.orderBy(options.orderBy, "desc");
    if (options.limit) q = q.limit(options.limit);
    const snap = await q.get();
    return snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as object) }));
  }
}

async function getDocument(collectionPath: string, docId: string) {
  await initFirebase();
  if (!db) throw new Error("Database not initialized");
  if (isClientDb) {
    const snap = await clientGetDoc(clientDoc(db, collectionPath, docId));
    return snap.exists() ? snap.data() : null;
  } else {
    const snap = await db.collection(collectionPath).doc(docId).get();
    return snap.exists ? snap.data() : null;
  }
}

async function setDocument(collectionPath: string, docId: string, data: any) {
  await initFirebase();
  if (!db) throw new Error("Database not initialized");
  if (isClientDb) {
    await clientSetDoc(clientDoc(db, collectionPath, docId), data);
  } else {
    await db.collection(collectionPath).doc(docId).set(data);
  }
}

async function addDocument(collectionPath: string, data: any) {
  await initFirebase();
  if (!db) throw new Error("Database not initialized");
  if (isClientDb) {
    const docRef = await clientAddDoc(clientCollection(db, collectionPath), data);
    return docRef.id;
  } else {
    const docRef = await db.collection(collectionPath).add(data);
    return docRef.id;
  }
}

export const app = express();
app.use(express.json());
const PORT = 3000;

// Force init on startup
initFirebase().then(() => setupScheduler());

// Gemini Initialization
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
});

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    dbInitialized: !!db,
    dbType: isClientDb ? "Client SDK (Fallback)" : "Admin SDK (Native)",
    lastError: db ? null : lastInitError,
    activeDatabase: (db as any)?.databaseId || (db as any)?._databaseId,
    config: {
      projectId: firebaseConfig.projectId,
      dbId: firebaseConfig.firestoreDatabaseId
    }
  });
});

// OAuth Routes
app.get("/api/auth/google/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/blogger"],
    prompt: "consent"
  });
  res.json({ url });
});

app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);
    const blogger = google.blogger({ version: "v3", auth: oauth2Client });
    const userBlogs = await blogger.blogs.listByUser({ userId: "self" });
    
    // Store tokens and default blog info in settings
    const blogInfo = userBlogs.data.items?.[0] || null;
    await setDocument("settings", "blog_config", {
      tokens,
      blogId: blogInfo?.id,
      blogName: blogInfo?.name,
      updatedAt: new Date().toISOString()
    });

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Blogger connected successfully! You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Auth error:", error);
    res.status(500).send("Authentication failed: " + error.message);
  }
});

app.get("/api/settings", async (req, res) => {
  try {
    const omdb = await getDocument("settings", "omdb_config");
    const blog = await getDocument("settings", "blog_config");
    const ads = await getDocument("settings", "ad_config");
    res.json({ 
      omdb: omdb || {}, 
      blog: {
        blogId: blog?.blogId,
        blogName: blog?.blogName,
        isConnected: !!blog?.tokens,
        isAutoPostEnabled: blog?.isAutoPostEnabled || false,
        lastAutoRun: blog?.lastAutoRun
      },
      ads: ads || {}
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/settings", async (req, res) => {
  try {
    const { omdb, ads, blogId, isAutoPostEnabled } = req.body;
    if (omdb) await setDocument("settings", "omdb_config", { ...omdb, updatedAt: new Date().toISOString() });
    if (ads) await setDocument("settings", "ad_config", { ...ads, updatedAt: new Date().toISOString() });
    
    const blog = await getDocument("settings", "blog_config") || {};
    let shouldUpdateBlog = false;
    if (blogId !== undefined) {
      blog.blogId = blogId;
      shouldUpdateBlog = true;
    }
    if (isAutoPostEnabled !== undefined) {
      blog.isAutoPostEnabled = isAutoPostEnabled;
      shouldUpdateBlog = true;
    }
    
    if (shouldUpdateBlog) {
      await setDocument("settings", "blog_config", { ...blog, updatedAt: new Date().toISOString() });
    }

    res.json({ status: "success" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/posts", async (req, res) => {
  try {
    const posts = await getCollection("posts", { orderBy: "publishedAt" });
    res.json(posts);
  } catch (error: any) {
    console.warn("Falling back to memory posts:", error.message);
    res.json([...memoryPosts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)));
  }
});

async function generateBlogPost(details: any) {
  if (!details || details.Response === "False") throw new Error(details?.Error || "Invalid movie data");
  const genres = details.Genre || "N/A";
  const castString = details.Actors || "N/A";

  const prompt = `You are an expert entertainment blogger. Write a complete, human-sounding SEO blog post about the movie described below. DO NOT include html or body tags. Respond ONLY with valid JSON.
MOVIE DATA: ${details.Title}, ${details.Plot}
OUTPUT FORMAT: { "seo_title": "...", "meta_description": "...", "slug": "...", "tags": [...], "article_html": "..." }`;

  const geminiResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          seo_title: { type: Type.STRING },
          meta_description: { type: Type.STRING },
          slug: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          article_html: { type: Type.STRING }
        },
        required: ["seo_title", "meta_description", "slug", "tags", "article_html"]
      }
    }
  });

  const result = JSON.parse(geminiResponse.text);

  // Inject Poster Image and Ads
  let finalHtml = result.article_html;
  const posterUrl = details.Poster !== "N/A" ? details.Poster : null;
  
  if (posterUrl) {
    finalHtml = `<div style="text-align: center; margin-bottom: 20px;"><img src="${posterUrl}" alt="${details.Title} Poster" style="max-width: 100%; height: auto; border-radius: 8px;" /></div>\n${finalHtml}`;
  }

  try {
    const ads = await getDocument("settings", "ad_config");
    const code = ads?.adCode;
    if (code) {
      finalHtml = `${code}\n${finalHtml}\n${code}`;
    }
  } catch (e) {}

  const postData: any = {
    imdbId: details.imdbID,
    movieTitle: details.Title,
    seoTitle: result.seo_title,
    metaDescription: result.meta_description,
    slug: result.slug,
    tags: result.tags,
    articleHtml: finalHtml,
    posterPath: details.Poster !== "N/A" ? details.Poster : null,
    publishedAt: new Date().toISOString(),
    status: "published"
  };

  try {
    const id = await addDocument("posts", postData);
    postData.id = id;

    // Automatic Publish to Blogger
    try {
      const blogPostId = await publishToBlogger(result.seo_title, finalHtml, result.tags);
      if (blogPostId) {
        await setDocument("posts", id, { ...postData, bloggerPostId: blogPostId });
      }
    } catch (blogErr) {
      console.warn("[Blogger] Auto-publish failed:", blogErr.message);
    }

  } catch (error: any) {
    console.warn("Write error, using memory fallback:", error.message);
    postData.id = details.imdbID || Math.random().toString(36).substring(7);
    memoryPosts.push(postData);
  }
  return { id: postData.id, title: details.Title };
}

app.post("/api/automation/run", async (req, res) => {
  let OMDB_KEY = process.env.OMDB_API_KEY;
  try {
    const settings = await getDocument("settings", "omdb_config");
    if (settings?.apiKey) OMDB_KEY = settings.apiKey;
  } catch (e) {}

  if (!OMDB_KEY) return res.status(400).json({ error: "OMDB_API_KEY not set" });

  try {
    const r = await fetch(`http://www.omdbapi.com/?apikey=${OMDB_KEY}&s=movie&y=2024&type=movie`);
    const data = await r.json();
    const movie = data.Search?.[Math.floor(Math.random() * data.Search.length)];
    if (!movie) throw new Error("No movies found");
    const dr = await fetch(`http://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${movie.imdbID}&plot=full`);
    const details = await dr.json();
    const result = await generateBlogPost(details);
    res.json({ status: "success", postId: result.id, movieTitle: result.title });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/posts/manual", async (req, res) => {
  try {
    const result = await generateBlogPost(req.body);
    res.json({ status: "success", postId: result.id, movieTitle: result.title });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/posts/:id/publish-blogger", async (req, res) => {
  try {
    const post = await getDocument("posts", req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });

    const blogPostId = await publishToBlogger(post.seoTitle, post.articleHtml, post.tags);
    if (blogPostId) {
      await setDocument("posts", req.params.id, { ...post, bloggerPostId: blogPostId });
      res.json({ status: "success", blogPostId });
    } else {
      res.status(400).json({ error: "Failed to publish. Ensure Blogger is connected." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  await initFirebase();
  setupScheduler();
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}
if (!process.env.VERCEL) {
  startServer();
}

export default app;
