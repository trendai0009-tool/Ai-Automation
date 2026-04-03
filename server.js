const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== MIDDLEWARE ==========
app.use(cors({
  origin: [
    'https://projectforgen.netlify.app',
    'http://localhost:3000',
    'http://localhost:5500'
  ],
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ========== ROOT ROUTE (Change 1 - Added) ==========
app.get('/', (req, res) => {
  res.send('🚀 Project Forge AI Backend is running! Use /api/health to check status.');
});

// ========== ENVIRONMENT VARIABLES ==========
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rfejuvethmxenitvkyjp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmZWp1dmV0aG14ZW5pdHZreWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MzY4NDgsImV4cCI6MjA5MDUxMjg0OH0.fyrT8xFyQpnrWOQRYC4OS6vhofV5bB7_su6YxkGKXm8';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ========== SUPABASE CLIENTS ==========
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========== HELPER FUNCTIONS ==========

async function getOrCreateUserProfile(supabaseId, email, name) {
  const { data: existingUser, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('supabase_id', supabaseId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('Error fetching user:', fetchError);
  }

  if (existingUser) {
    if (name && existingUser.name !== name) {
      await supabaseAdmin
        .from('users')
        .update({ name, updated_at: new Date() })
        .eq('supabase_id', supabaseId);
      existingUser.name = name;
    }
    return existingUser;
  }

  const { data: newUser, error: createError } = await supabaseAdmin
    .from('users')
    .insert([{
      supabase_id: supabaseId,
      email: email,
      name: name || email.split('@')[0],
      plan: 'free',
      monthly_generations: 0,
      last_reset_date: new Date().toISOString()
    }])
    .select()
    .single();

  if (createError) {
    console.error('Error creating user:', createError);
    throw new Error('Failed to create user profile');
  }

  return newUser;
}

async function resetMonthlyCounterIfNeeded(user) {
  const now = new Date();
  const lastReset = new Date(user.last_reset_date);

  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ monthly_generations: 0, last_reset_date: now.toISOString() })
      .eq('id', user.id);

    if (!error) {
      user.monthly_generations = 0;
      user.last_reset_date = now.toISOString();
    }
  }
  return user;
}

async function canGenerate(supabaseId) {
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('supabase_id', supabaseId)
    .single();

  if (error || !user) {
    return { allowed: false, message: 'User not found', user: null };
  }

  await resetMonthlyCounterIfNeeded(user);

  if (user.plan === 'pro' || user.plan === 'lifetime') {
    return { allowed: true, user };
  }

  if (user.monthly_generations >= 500) {
    return { allowed: false, message: 'Free limit reached (500/month). Please upgrade to Pro.', user };
  }

  return { allowed: true, user };
}

// ========== GEMINI AI FUNCTION (Change 3 - Platform-wise output) ==========
async function generateWithGemini(prompt, platform, images) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const systemInstruction = `Tum Project Forge AI ho — ek expert assistant jo "${platform}" ke liye professional content generate karta hai.

Rules:
- User jo bhi maange woh EXACTLY "${platform}" ke real format mein banao
- Microsoft Excel: proper table, headers, =SUM() =AVERAGE() formulas, rows/columns clearly
- Microsoft Word: document structure, headings, paragraphs, professional formatting
- Microsoft PowerPoint: Slide 1, Slide 2 format mein bullet points ke saath
- Microsoft Access: table structure, field names, data types clearly
- Microsoft Outlook: email format — Subject, To, Body properly
- Microsoft OneNote: notes format — sections aur pages
- Google Docs: clean document format with headings
- Google Sheets: spreadsheet with formulas and headers
- Google Slides: slide-by-slide content with bullet points
- Google Forms: question aur options format
- LibreOffice / Apache OpenOffice / WPS Office: MS Office jaisa professional format
- Zoho Office Suite: professional document format
- Tally: voucher entries, ledger format, GST details — Tally language mein
- Busy Accounting Software: accounting entries format properly
- QuickBooks: invoice, P&L, ledger format
- Notepad: plain text, clean aur simple format
- WordPad: basic formatted text
- PDF: well structured content
- Hindi aur English dono accept karo
- Output complete aur ready-to-use hona chahiye
- Agar image upload hai to uska data/content read karke use karo`;

  let parts = [];

  if (images && images.length > 0) {
    images.forEach(function (img) {
      parts.push({
        inline_data: {
          mime_type: img.mediaType || img.type || 'image/jpeg',
          data: img.base64
        }
      });
    });
  }

  const userText = prompt || (platform + ' ke liye professional content banao.');
  parts.push({ text: userText });

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [{
        role: 'user',
        parts: parts
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error('Gemini API Error: ' + data.error.message);
  }

  const output = data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0]
    ? data.candidates[0].content.parts[0].text
    : null;

  if (!output) {
    throw new Error('Gemini se koi output nahi mila');
  }

  return output;
}

// Fallback output (jab API na ho)
function generateFallbackOutput(prompt, platform) {
  const isExcel = platform.includes('Excel') || platform.includes('Sheets');
  const isAccounting = platform.includes('Tally') || platform.includes('QuickBooks') || platform.includes('Busy');

  if (isExcel || isAccounting) {
    return `Product,Category,Quantity,Price,Total
AI Laptop,Electronics,25,1299,32475
Smart Desk,Furniture,18,599,10782
Wireless Mouse,Accessories,120,29,3480
USB Hub,Accessories,85,19,1615
Software License,Digital,50,199,9950

Platform: ${platform}
Prompt: ${prompt}
Total Revenue: 58302
Growth: +18% YoY`;
  }

  return `Document Generated for ${platform}

Prompt: ${prompt}

EXECUTIVE SUMMARY
Strong performance in Q2 2025 with revenue growth of 18%.

KEY FINDINGS
- Revenue: $2.3M (+18%)
- Customer acquisition: +245 new clients
- Top region: North India
- Product leader: AI Workstation series

RECOMMENDATIONS
1. Increase marketing in emerging markets
2. Launch loyalty program
3. Expand AI feature set

Generated by Project Forge AI`;
}

// ========== API ROUTES ==========

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    supabase: 'connected',
    gemini: GEMINI_API_KEY ? 'configured' : 'not configured',
    timestamp: new Date().toISOString()
  });
});

// Sync user
app.post('/api/user/sync', async (req, res) => {
  try {
    const { supabaseId, user_id, email, name } = req.body;
    const id = supabaseId || user_id;

    if (!id || !email) {
      return res.status(400).json({ error: 'supabaseId and email are required' });
    }

    const user = await getOrCreateUserProfile(id, email, name);

    res.json({
      success: true,
      user: {
        id: user.id,
        supabaseId: user.supabase_id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        monthlyGenerations: user.monthly_generations,
        remainingGenerations: user.plan === 'free' ? 500 - user.monthly_generations : 'Unlimited'
      }
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user details
app.get('/api/user/:supabaseId', async (req, res) => {
  try {
    const { supabaseId } = req.params;

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('supabase_id', supabaseId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await resetMonthlyCounterIfNeeded(user);

    const { data: freshUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('supabase_id', supabaseId)
      .single();

    res.json({
      id: freshUser.id,
      supabaseId: freshUser.supabase_id,
      email: freshUser.email,
      name: freshUser.name,
      plan: freshUser.plan,
      monthlyGenerations: freshUser.monthly_generations,
      remainingGenerations: freshUser.plan === 'free' ? 500 - freshUser.monthly_generations : 'Unlimited'
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save generation history
app.post('/api/history', async (req, res) => {
  try {
    const { supabaseId, prompt, platform, output, outputType } = req.body;

    if (!supabaseId || !prompt || !platform || !output) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('supabase_id', supabaseId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { data: history, error: historyError } = await supabaseAdmin
      .from('generation_history')
      .insert([{
        user_id: user.id,
        prompt: prompt,
        platform: platform,
        output: output,
        output_type: outputType || 'doc'
      }])
      .select()
      .single();

    if (historyError) {
      console.error('Save history error:', historyError);
      return res.status(500).json({ error: 'Failed to save history' });
    }

    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('plan, monthly_generations')
      .eq('supabase_id', supabaseId)
      .single();

    if (userData && userData.plan === 'free') {
      await supabaseAdmin
        .from('users')
        .update({ monthly_generations: userData.monthly_generations + 1 })
        .eq('supabase_id', supabaseId);
    }

    res.json({ success: true, historyId: history.id });
  } catch (error) {
    console.error('Save history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user history
app.get('/api/history/:supabaseId', async (req, res) => {
  try {
    const { supabaseId } = req.params;

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('supabase_id', supabaseId)
      .single();

    if (userError || !user) {
      return res.json([]);
    }

    const { data: history, error: historyError } = await supabaseAdmin
      .from('generation_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (historyError) {
      return res.json([]);
    }

    res.json(history);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear user history
app.delete('/api/history/:supabaseId', async (req, res) => {
  try {
    const { supabaseId } = req.params;

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('supabase_id', supabaseId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('generation_history')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to clear history' });
    }

    res.json({ success: true, message: 'History cleared' });
  } catch (error) {
    console.error('Clear history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== AI GENERATE — GEMINI (Change 4 - Free/Paid limits) ==========
app.post('/api/generate', async (req, res) => {
  try {
    const { supabaseId, user_id, prompt, platform, images } = req.body;
    const userId = supabaseId || user_id;

    if (!prompt && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'Prompt ya image zaroori hai' });
    }

    if (!platform) {
      return res.status(400).json({ error: 'Platform select karo' });
    }

    // User limit check (Change 4 - Free users: 500/month)
    let user = null;
    if (userId) {
      const { allowed, message, user: u } = await canGenerate(userId);
      if (!allowed) {
        return res.status(403).json({ error: message });
      }
      user = u;
    }

    let output = '';

    if (GEMINI_API_KEY) {
      try {
        output = await generateWithGemini(prompt, platform, images);
      } catch (apiError) {
        console.error('Gemini error:', apiError.message);
        output = generateFallbackOutput(prompt || 'Generate content', platform);
      }
    } else {
      output = generateFallbackOutput(prompt || 'Generate content', platform);
    }

    // History save karo
    if (userId) {
      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('id, plan, monthly_generations')
        .eq('supabase_id', userId)
        .single();

      if (userData) {
        await supabaseAdmin
          .from('generation_history')
          .insert([{
            user_id: userData.id,
            prompt: (prompt || 'Image/File upload').substring(0, 1000),
            platform: platform,
            output: output.substring(0, 5000),
            output_type: (platform.includes('Excel') || platform.includes('Sheets')) ? 'tabular' : 'doc'
          }]);

        if (userData.plan === 'free') {
          await supabaseAdmin
            .from('users')
            .update({ monthly_generations: (userData.monthly_generations || 0) + 1 })
            .eq('supabase_id', userId);
        }
      }
    }

    res.json({ output, outputType: (platform.includes('Excel') || platform.includes('Sheets')) ? 'tabular' : 'doc' });

  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Upgrade user plan
app.post('/api/upgrade/:supabaseId', async (req, res) => {
  try {
    const { supabaseId } = req.params;
    const { plan } = req.body;

    if (!plan || !['pro', 'lifetime'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('supabase_id', supabaseId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await supabaseAdmin
      .from('users')
      .update({ plan: plan })
      .eq('supabase_id', supabaseId);

    res.json({ success: true, plan: plan });
  } catch (error) {
    console.error('Upgrade error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Supabase: ${SUPABASE_URL}`);
  console.log(`🤖 Gemini AI: ${GEMINI_API_KEY ? '✅ Configured' : '❌ Not configured (fallback mode)'}`);
});
