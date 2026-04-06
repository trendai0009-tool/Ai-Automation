// ============================================================
//  PROJECT FORGE AI — COMPLETE BACKEND v4.0
//  Node.js + Express + SiliconFlow AI + Razorpay + Supabase
//  FREE: 3 generations/day (TEST ONLY - No Export/Download)
//  PAID: Unlimited generations + Full Export/Download
// ============================================================
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const crypto     = require('crypto');
const multer     = require('multer');
const axios      = require('axios');
const Razorpay   = require('razorpay');
const { createClient } = require('@supabase/supabase-js');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors({ origin: '*', methods: ['GET','POST','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── ENV VALIDATION ──────────────────────────────────────────
const REQUIRED = ['SILICONFLOW_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
REQUIRED.forEach(k => { 
  if (!process.env[k]) console.warn(`WARNING: Missing env var: ${k}`); 
});

// ─── CLIENTS ─────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ─── CONSTANTS ───────────────────────────────────────────────
const FREE_DAILY_LIMIT = 3;  // Sirf 3 free generations/day (TEST ONLY)

const PLAN_PRICES = {
  '1 Month':  19900,   // ₹199
  '3 Months': 29900,   // ₹299  
  '6 Months': 39900,   // ₹399
  '1 Year':   49900    // ₹499 - 1 year plan
};

const ALL_PLATFORMS = [
  'Microsoft Excel','Microsoft Word','Microsoft Access','Microsoft PowerPoint',
  'Microsoft Outlook','Microsoft OneNote','Google Docs','Google Sheets',
  'Google Slides','Google Forms','LibreOffice','Apache OpenOffice',
  'WPS Office','Zoho Office Suite','Tally','Busy Accounting Software',
  'QuickBooks','Notepad','WordPad'
];

// ─── SILICONFLOW MODEL MAPPING (Best quality models) ─────────
const MODEL_MAPPING = {
  // Accounting & Finance (Best with DeepSeek - High quality)
  'Tally': 'deepseek-ai/DeepSeek-V3',
  'QuickBooks': 'deepseek-ai/DeepSeek-V3',
  'Busy Accounting Software': 'deepseek-ai/DeepSeek-V3',
  'Microsoft Access': 'deepseek-ai/DeepSeek-V3',
  
  // Office & Documents (Best with Qwen 72B - High quality)
  'Microsoft Excel': 'Pro/Qwen/Qwen2.5-72B-Instruct',
  'Microsoft Word': 'Pro/Qwen/Qwen2.5-72B-Instruct',
  'Microsoft PowerPoint': 'Pro/Qwen/Qwen2.5-72B-Instruct',
  'Google Sheets': 'Pro/Qwen/Qwen2.5-72B-Instruct',
  'Google Docs': 'Pro/Qwen/Qwen2.5-72B-Instruct',
  'Google Slides': 'Pro/Qwen/Qwen2.5-72B-Instruct',
  'Google Forms': 'Pro/Qwen/Qwen2.5-72B-Instruct',
  'LibreOffice': 'Pro/Qwen/Qwen2.5-72B-Instruct',
  'Apache OpenOffice': 'Pro/Qwen/Qwen2.5-72B-Instruct',
  'WPS Office': 'Pro/Qwen/Qwen2.5-72B-Instruct',
  'Zoho Office Suite': 'Pro/Qwen/Qwen2.5-72B-Instruct',
  'Microsoft Outlook': 'Pro/Qwen/Qwen2.5-72B-Instruct',
  'Microsoft OneNote': 'Pro/Qwen/Qwen2.5-72B-Instruct',
  'Notepad': 'Pro/Qwen/Qwen2.5-72B-Instruct',
  'WordPad': 'Pro/Qwen/Qwen2.5-72B-Instruct'
};

const DEFAULT_MODEL = 'Pro/Qwen/Qwen2.5-72B-Instruct';

// ─── SILICONFLOW AI CALL FUNCTION (High Quality) ─────────────
async function callSiliconFlow(systemPrompt, userContent, selectedPlatform) {
  const model = MODEL_MAPPING[selectedPlatform] || DEFAULT_MODEL;
  
  let messages = [];
  
  if (typeof userContent === 'string') {
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];
  } else {
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];
  }
  
  try {
    console.log(`🟢 SiliconFlow API - Model: ${model}, Platform: ${selectedPlatform}`);
    
    const response = await axios.post(
      'https://api.siliconflow.com/v1/chat/completions',
      {
        model: model,
        messages: messages,
        max_tokens: 4096,
        temperature: 0.7,
        top_p: 0.9,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );
    
    const outputText = response.data.choices[0].message.content;
    console.log(`✅ SiliconFlow Success - Model: ${model}`);
    
    return {
      content: [{ type: 'text', text: outputText }],
      usage: response.data.usage,
      model: model
    };
    
  } catch (error) {
    console.error('❌ SiliconFlow Error:', error.response?.data?.error || error.message);
    throw new Error(`AI generation failed: ${error.response?.data?.error?.message || error.message}`);
  }
}

// ============================================================
//  PLATFORM SYSTEM PROMPTS — 19 platforms (High quality)
//  [YAHAN APNE ORIGINAL FILE SE SAARE 19 PROMPTS COPY KARO]
// ============================================================
function getSystemPrompt(platform) {
  // ⚠️ CRITICAL: Yahan apne server(2).js file se saare 19 prompts copy karein
  // Niche example diya hai. Aap apne original prompts use karein.
  
  const PROMPTS = {
    'Microsoft Excel': `You are an expert Microsoft Excel specialist. Generate complete, ready-to-use Excel content.

OUTPUT RULES:
- Use TAB-separated values for spreadsheet data
- Row 1 = Column headers always
- Add Excel formulas using = prefix: =SUM(), =VLOOKUP(), =IF(), =SUMIF(), =COUNTIF(), =AVERAGE()
- Include TOTALS row at bottom using SUM formulas
- Add notes for number formatting (Currency, Percentage, Date)

WORK TYPES TO COVER:
GST Invoice: Invoice No | Date | Party Name | HSN/SAC | Description | Qty | Unit | Rate | Amount | CGST% | CGST Amt | SGST% | SGST Amt | IGST% | IGST Amt | Grand Total

Salary Sheet: Emp ID | Name | Designation | Basic | HRA(40%) | DA | TA | Gross | PF(12%) | ESI(0.75%) | TDS | Net Pay

Always end with: "EXCEL TIPS: [3 relevant tips for using this sheet efficiently]"`,

    'Tally': `You are a TallyPrime / Tally ERP 9 certified expert. Generate complete, import-ready Tally data.

TALLY VOUCHER FORMAT:
VOUCHER TYPE: [Sales/Purchase/Payment/Receipt/Journal]
Date: [DD-MM-YYYY]
Dr: [Ledger Name]................................Rs.[Amount]
Cr: [Ledger Name]................................Rs.[Amount]
Narration: [text]

GST INVOICE FORMAT:
S.No | Stock Item | HSN/SAC | Qty | Unit | Rate | Amount
Taxable Value, CGST, SGST, IGST, Grand Total

TALLY SHORTCUTS: F4=Contra, F5=Payment, F6=Receipt, F7=Journal, F8=Sales, F9=Purchase`,

    // ... AISE HI BAQI 17 PLATFORMS KE PROMPTS
  };
  
  return PROMPTS[platform] || `You are an expert AI assistant for ${platform}. Generate complete, professional, ready-to-use content. Support Hindi and English. Be thorough.`;
}

// ============================================================
//  HELPER: CHECK & INCREMENT DAILY USAGE
// ============================================================
async function checkAndIncrementUsage(userId) {
  const { data: userData, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !userData?.user) throw new Error('User not found');

  const meta = userData.user.user_metadata || {};
  const plan = meta.plan || 'free';
  const today = new Date().toISOString().split('T')[0];

  // Check 1 Year plan expiry
  if (plan === 'yearly' && meta.planExpiresAt) {
    if (new Date(meta.planExpiresAt) < new Date()) {
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { ...meta, plan: 'free' }
      }).catch(() => {});
    } else {
      return { allowed: true, plan: 'yearly', remaining: 'unlimited' };
    }
  }

  if (plan === 'pro') return { allowed: true, plan: 'pro', remaining: 'unlimited' };
  if (plan === 'yearly') return { allowed: true, plan: 'yearly', remaining: 'unlimited' };

  // Free plan daily check - ONLY 3 per day
  const usageKey = `usage_${today}`;
  const used = parseInt(meta[usageKey] || 0);

  if (used >= FREE_DAILY_LIMIT) {
    return { 
      allowed: false, 
      plan: 'free', 
      remaining: 0, 
      used, 
      limit: FREE_DAILY_LIMIT,
      message: `You have reached your daily limit of ${FREE_DAILY_LIMIT} free generations. Please upgrade to Pro plan for unlimited access.`
    };
  }

  await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { ...meta, [usageKey]: used + 1 }
  });

  return { allowed: true, plan: 'free', remaining: FREE_DAILY_LIMIT - used - 1, used: used + 1 };
}

// ============================================================
//  HELPER: ACTIVATE PLAN FOR USER
// ============================================================
async function activatePlanForUser(userId, planName, paymentId) {
  const { data: userData } = await supabase.auth.admin.getUserById(userId);
  const existingMeta = userData?.user?.user_metadata || {};

  const isYearlyPlan = planName === '1 Year';
  const planType = isYearlyPlan ? 'yearly' : 'pro';

  let expiresAt = null;
  if (isYearlyPlan) {
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 1);
    expiresAt = exp.toISOString();
  } else {
    const months = planName === '6 Months' ? 6 : (planName === '3 Months' ? 3 : 1);
    const exp = new Date();
    exp.setMonth(exp.getMonth() + months);
    expiresAt = exp.toISOString();
  }

  await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...existingMeta,
      plan: planType,
      planName: planName,
      paymentId: paymentId,
      planActivatedAt: new Date().toISOString(),
      planExpiresAt: expiresAt
    }
  });

  await supabase.from('subscriptions').upsert([{
    user_id: userId,
    plan: planType,
    plan_name: planName,
    payment_id: paymentId,
    activated_at: new Date().toISOString(),
    expires_at: expiresAt,
    is_active: true
  }], { onConflict: 'user_id' }).catch(e => console.warn('Sub upsert warn:', e.message));
}

// ============================================================
//  ROUTE: GET /  — Health check
// ============================================================
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Project Forge AI Backend v4.0',
    platforms: ALL_PLATFORMS.length,
    freeDailyLimit: FREE_DAILY_LIMIT,
    freePlanInfo: `${FREE_DAILY_LIMIT} generations per day for testing only. Export/Download requires upgrade.`,
    aiProvider: 'SiliconFlow (High Quality Models)',
    plans: ['1 Month (₹199)', '3 Months (₹299)', '6 Months (₹399)', '1 Year (₹499)']
  });
});

// ============================================================
//  ROUTE: POST /api/generate  — Main AI generation
// ============================================================
app.post('/api/generate', async (req, res) => {
  try {
    const { supabaseId, prompt, platform, images } = req.body;

    if (!supabaseId) return res.status(401).json({ error: 'Login required' });
    if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt is required' });

    const selectedPlatform = ALL_PLATFORMS.includes(platform) ? platform : 'Microsoft Excel';

    // Usage check
    let usageCheck;
    try {
      usageCheck = await checkAndIncrementUsage(supabaseId);
    } catch (e) {
      return res.status(401).json({ error: 'User verification failed: ' + e.message });
    }

    // If limit reached, return upgrade message (NOT error)
    if (!usageCheck.allowed) {
      return res.status(402).json({  // 402 Payment Required
        success: false,
        limitReached: true,
        requiresUpgrade: true,
        message: `You have reached your daily limit of ${FREE_DAILY_LIMIT} free generations. Please upgrade to Pro plan for unlimited access and full export/download features.`,
        plan: 'free',
        remaining: 0,
        limit: FREE_DAILY_LIMIT,
        upgradeUrl: '/#pricing',
        action: 'upgrade_required'
      });
    }

    // Build message content
    const userContent = [];

    if (Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        if (img?.base64 && img?.mediaType) {
          userContent.push({ 
            type: 'image_url', 
            image_url: { url: `data:${img.mediaType};base64,${img.base64}` }
          });
        }
      }
    }

    userContent.push({
      type: 'text',
      text: `Platform: ${selectedPlatform}\n\nUser Request: ${prompt.trim()}\n\nGenerate complete, professional, ready-to-use output. Be thorough. Include all sections, formulas, examples. Output must be immediately usable.`
    });

    // Call SiliconFlow AI
    const aiResponse = await callSiliconFlow(
      getSystemPrompt(selectedPlatform),
      userContent,
      selectedPlatform
    );

    const output = aiResponse.content.filter(b => b.type === 'text').map(b => b.text).join('\n');

    // Save history with plan info
    await supabase.from('generation_history').insert([{
      user_id: supabaseId,
      prompt: prompt.trim().substring(0, 500),
      platform: selectedPlatform,
      output: output.substring(0, 10000),
      created_at: new Date().toISOString(),
      model: aiResponse.model,
      plan_at_generation: usageCheck.plan
    }]).catch(e => console.warn('History warn:', e.message));

    return res.json({
      success: true,
      output,
      platform: selectedPlatform,
      plan: usageCheck.plan,
      remaining: usageCheck.remaining,
      model: aiResponse.model,
      canExport: usageCheck.plan !== 'free',  // Free users cannot export
      canDownload: usageCheck.plan !== 'free', // Free users cannot download
      canCopy: usageCheck.plan !== 'free',     // Free users cannot copy
      upgradeMessage: usageCheck.plan === 'free' ? 'Upgrade to Pro to export, copy and download this content.' : null
    });

  } catch (err) {
    console.error('Generate error:', err.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Generation failed: ' + err.message 
    });
  }
});

// ============================================================
//  ROUTE: POST /api/generate-with-file  — File upload
// ============================================================
app.post('/api/generate-with-file', upload.array('files', 5), async (req, res) => {
  try {
    const { supabaseId, prompt, platform } = req.body;
    const files = req.files || [];

    if (!supabaseId) return res.status(401).json({ error: 'Login required' });

    const selectedPlatform = ALL_PLATFORMS.includes(platform) ? platform : 'Microsoft Excel';

    const usageCheck = await checkAndIncrementUsage(supabaseId);
    
    if (!usageCheck.allowed) {
      return res.status(402).json({
        success: false,
        limitReached: true,
        requiresUpgrade: true,
        message: `You have reached your daily limit of ${FREE_DAILY_LIMIT} free generations. Please upgrade to Pro plan for unlimited access.`,
        plan: 'free',
        remaining: 0,
        limit: FREE_DAILY_LIMIT,
        upgradeUrl: '/#pricing'
      });
    }

    const userContent = [];

    for (const file of files) {
      if (file.mimetype.startsWith('image/')) {
        userContent.push({ 
          type: 'image_url', 
          image_url: { url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}` }
        });
      } else {
        userContent.push({ 
          type: 'text', 
          text: `[File uploaded: ${file.originalname}]` 
        });
      }
    }

    userContent.push({
      type: 'text',
      text: `Platform: ${selectedPlatform}\nTask: ${prompt || 'Generate professional output for ' + selectedPlatform}`
    });

    const aiResponse = await callSiliconFlow(
      getSystemPrompt(selectedPlatform),
      userContent,
      selectedPlatform
    );

    const output = aiResponse.content.filter(b => b.type === 'text').map(b => b.text).join('\n');

    await supabase.from('generation_history').insert([{
      user_id: supabaseId,
      prompt: (prompt || 'File upload').substring(0, 500),
      platform: selectedPlatform,
      output: output.substring(0, 10000),
      created_at: new Date().toISOString(),
      model: aiResponse.model
    }]).catch(() => {});

    return res.json({ 
      success: true,
      output, 
      platform: selectedPlatform, 
      plan: usageCheck.plan, 
      remaining: usageCheck.remaining,
      canExport: usageCheck.plan !== 'free',
      canDownload: usageCheck.plan !== 'free',
      canCopy: usageCheck.plan !== 'free'
    });

  } catch (err) {
    console.error('File generate error:', err.message);
    return res.status(500).json({ error: 'File generation failed: ' + err.message });
  }
});

// ============================================================
//  ROUTE: POST /api/create-order  — Razorpay order
// ============================================================
app.post('/api/create-order', async (req, res) => {
  try {
    const { planName, userId } = req.body;
    
    let actualPlanName = planName;
    if (planName === 'Lifetime') actualPlanName = '1 Year';
    
    if (!PLAN_PRICES[actualPlanName]) {
      return res.status(400).json({ error: 'Invalid plan: ' + planName });
    }

    const order = await razorpay.orders.create({
      amount: PLAN_PRICES[actualPlanName],
      currency: 'INR',
      receipt: `forge_${Date.now()}`.substring(0, 40),
      notes: { userId, planName: actualPlanName }
    });

    return res.json({ orderId: order.id, amount: order.amount, currency: 'INR', planName: actualPlanName });

  } catch (err) {
    console.error('Create order error:', err.message);
    return res.status(500).json({ error: 'Order creation failed: ' + err.message });
  }
});

// ============================================================
//  ROUTE: POST /api/verify-payment
// ============================================================
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, planName, amount } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Payment details missing' });
    }

    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    let actualPlanName = planName;
    if (planName === 'Lifetime') actualPlanName = '1 Year';

    await activatePlanForUser(userId, actualPlanName, razorpay_payment_id);

    await supabase.from('payments').insert([{
      user_id: userId, payment_id: razorpay_payment_id, order_id: razorpay_order_id,
      plan: actualPlanName, amount: amount || PLAN_PRICES[actualPlanName], status: 'success',
      created_at: new Date().toISOString()
    }]).catch(e => console.warn('Payment log warn:', e.message));

    return res.json({ success: true, message: 'Payment verified and plan activated!' });

  } catch (err) {
    console.error('Verify payment error:', err.message);
    return res.status(500).json({ error: 'Verification error: ' + err.message });
  }
});

// ============================================================
//  ROUTE: POST /api/upgrade/:userId
// ============================================================
app.post('/api/upgrade/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    let { plan, paymentId, planName } = req.body;
    
    if (plan === 'Lifetime' || planName === 'Lifetime') {
      plan = 'yearly';
      planName = '1 Year';
    }
    
    await activatePlanForUser(userId, planName || plan, paymentId);
    return res.json({ success: true, plan: planName || plan, message: 'Plan activated!' });
  } catch (err) {
    console.error('Upgrade error:', err.message);
    return res.status(500).json({ error: 'Upgrade failed: ' + err.message });
  }
});

// ============================================================
//  ROUTE: GET /api/user/:userId
// ============================================================
app.get('/api/user/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(req.params.userId);
    if (error) return res.status(404).json({ error: 'User not found' });
    const meta = data.user.user_metadata || {};
    let plan = meta.plan || 'free';
    const today = new Date().toISOString().split('T')[0];
    const usedToday = parseInt(meta[`usage_${today}`] || 0);
    
    if (plan === 'yearly' && meta.planExpiresAt && new Date(meta.planExpiresAt) < new Date()) {
      plan = 'free';
    }
    
    return res.json({
      userId: req.params.userId, 
      email: data.user.email,
      name: meta.name || data.user.email?.split('@')[0],
      plan: plan,
      planName: plan === 'yearly' ? '1 Year Plan' : meta.planName,
      planActivatedAt: meta.planActivatedAt, 
      planExpiresAt: meta.planExpiresAt,
      usedToday, 
      dailyLimit: plan === 'free' ? FREE_DAILY_LIMIT : 'unlimited',
      remaining: plan === 'free' ? Math.max(0, FREE_DAILY_LIMIT - usedToday) : 'unlimited',
      isPro: plan === 'pro' || plan === 'yearly',
      canExport: plan !== 'free',
      canDownload: plan !== 'free',
      canCopy: plan !== 'free'
    });
  } catch (err) { 
    return res.status(500).json({ error: err.message }); 
  }
});

// ============================================================
//  ROUTE: GET /api/history/:userId
// ============================================================
app.get('/api/history/:userId', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const { data, error } = await supabase
      .from('generation_history').select('id,prompt,platform,output,created_at,model')
      .eq('user_id', req.params.userId).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return res.json({ history: data || [], count: data?.length || 0 });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// ============================================================
//  ROUTE: DELETE /api/history/:userId
// ============================================================
app.delete('/api/history/:userId', async (req, res) => {
  try {
    const { error } = await supabase.from('generation_history').delete().eq('user_id', req.params.userId);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// ============================================================
//  ROUTE: GET /api/platforms
// ============================================================
app.get('/api/platforms', (req, res) => {
  res.json({
    platforms: [
      { name:'Microsoft Excel', icon:'📊', category:'Microsoft Office', color:'#107C41' },
      { name:'Microsoft Word', icon:'📝', category:'Microsoft Office', color:'#2B579A' },
      { name:'Microsoft Access', icon:'🗄️', category:'Microsoft Office', color:'#A4373A' },
      { name:'Microsoft PowerPoint', icon:'📽️', category:'Microsoft Office', color:'#C43E1C' },
      { name:'Microsoft Outlook', icon:'📧', category:'Microsoft Office', color:'#0078D4' },
      { name:'Microsoft OneNote', icon:'📓', category:'Microsoft Office', color:'#7719AA' },
      { name:'Google Docs', icon:'📄', category:'Google Workspace', color:'#4285F4' },
      { name:'Google Sheets', icon:'📈', category:'Google Workspace', color:'#34A853' },
      { name:'Google Slides', icon:'🎴', category:'Google Workspace', color:'#FBBC04' },
      { name:'Google Forms', icon:'📋', category:'Google Workspace', color:'#7E57C2' },
      { name:'LibreOffice', icon:'🐧', category:'Open Source', color:'#18A303' },
      { name:'Apache OpenOffice', icon:'🔓', category:'Open Source', color:'#de3b3e' },
      { name:'WPS Office', icon:'📑', category:'Office Suite', color:'#FF2D4B' },
      { name:'Zoho Office Suite', icon:'🔵', category:'Cloud Suite', color:'#E42527' },
      { name:'Tally', icon:'🧾', category:'Accounting', color:'#1a4f8a' },
      { name:'Busy Accounting Software', icon:'💼', category:'Accounting', color:'#0066CC' },
      { name:'QuickBooks', icon:'💰', category:'Accounting', color:'#2E7D32' },
      { name:'Notepad', icon:'🗒️', category:'Text Editor', color:'#424242' },
      { name:'WordPad', icon:'✏️', category:'Text Editor', color:'#1565C0' }
    ],
    total: 19
  });
});

// ============================================================
//  ROUTE: GET /api/payments/:userId
// ============================================================
app.get('/api/payments/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('payments').select('*')
      .eq('user_id', req.params.userId).order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ payments: data || [] });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// ─── 404 & Error handlers ─────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));
app.use((err, req, res, next) => { console.error('Unhandled:', err); res.status(500).json({ error: 'Internal server error' }); });

// ============================================================
//  START SERVER
// ============================================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('\n========================================');
  console.log('  PROJECT FORGE AI BACKEND v4.0');
  console.log(`  Running on port: ${PORT}`);
  console.log(`  Platforms: ${ALL_PLATFORMS.length}`);
  console.log(`  FREE LIMIT: ${FREE_DAILY_LIMIT} generations/day (TEST ONLY)`);
  console.log('  FREE PLAN: Generate only, No Export/Copy/Download');
  console.log('  PAID PLAN: Unlimited + Full Export/Download');
  console.log('  AI Provider: SiliconFlow (High Quality Models)');
  console.log('  Plans: 1 Month (₹199) | 3 Months (₹299) | 6 Months (₹399) | 1 Year (₹499)');
  console.log('========================================\n');
});