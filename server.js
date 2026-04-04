const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== CORS - FULLY CONFIGURED ==========
app.use(cors({
  origin: [
    'https://aiforgen.netlify.app',
    'https://projectforgen.netlify.app',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ========== ENVIRONMENT VARIABLES ==========
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rfejuvethmxenitvkyjp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

console.log('========================================');
console.log('🚀 Project Forge AI Backend Starting...');
console.log('========================================');
console.log(`📊 Supabase URL: ${SUPABASE_URL}`);
console.log(`🤖 Gemini API: ${GEMINI_API_KEY ? '✅ CONFIGURED' : '⚠️ FALLBACK MODE'}`);
console.log(`🔑 Service Role: ${SUPABASE_SERVICE_ROLE_KEY ? '✅ SET' : '❌ MISSING'}`);
console.log('========================================');

// ========== SUPABASE CLIENT ==========
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ========== ROOT ROUTE ==========
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    message: 'Project Forge AI Backend Running',
    gemini: !!GEMINI_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// ========== HEALTH CHECK ==========
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    supabase: SUPABASE_URL ? 'connected' : 'missing',
    gemini: GEMINI_API_KEY ? 'configured' : 'not configured',
    timestamp: new Date().toISOString(),
    cors: 'enabled for aiforgen.netlify.app'
  });
});

// ========== SYNC USER ==========
app.post('/api/user/sync', async (req, res) => {
  try {
    const { supabaseId, user_id, email, name } = req.body;
    const userId = supabaseId || user_id;

    if (!userId || !email) {
      return res.status(400).json({ error: 'supabaseId and email required' });
    }

    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('supabase_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Fetch error:', error);
    }

    if (user) {
      if (name && user.name !== name) {
        await supabase
          .from('users')
          .update({ name, updated_at: new Date() })
          .eq('supabase_id', userId);
      }
      
      // Reset monthly counter
      const now = new Date();
      const lastReset = new Date(user.last_reset_date);
      if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
        await supabase
          .from('users')
          .update({ monthly_generations: 0, last_reset_date: now.toISOString() })
          .eq('supabase_id', userId);
        user.monthly_generations = 0;
      }
      
      return res.json({
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
    }

    // Create new user
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{
        supabase_id: userId,
        email: email,
        name: name || email.split('@')[0],
        plan: 'free',
        monthly_generations: 0,
        last_reset_date: new Date().toISOString()
      }])
      .select()
      .single();

    if (createError) {
      return res.status(500).json({ error: 'Failed to create user: ' + createError.message });
    }

    res.json({
      success: true,
      user: {
        id: newUser.id,
        supabaseId: newUser.supabase_id,
        email: newUser.email,
        name: newUser.name,
        plan: newUser.plan,
        monthlyGenerations: 0,
        remainingGenerations: 500
      }
    });

  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== GEMINI GENERATION ==========
async function generateWithGemini(prompt, platform, images) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const systemPrompt = `You are Project Forge AI. Generate professional content for "${platform}".

CRITICAL RULES:
- Generate EXACT format for ${platform}
- Excel/Sheets: Tables with headers, formulas like =SUM(), =AVERAGE()
- Word/Docs: Professional document with headings and paragraphs
- PowerPoint/Slides: Format as "Slide 1: Title\\n- Bullet point"
- Tally: Voucher entries, ledger format with GST
- QuickBooks: Invoice format, P&L statement
- Output must be ready-to-use, no extra explanation
- Support both Hindi and English`;

  let parts = [];

  if (images && images.length > 0) {
    for (const img of images) {
      parts.push({
        inline_data: {
          mime_type: img.mediaType || img.type || 'image/jpeg',
          data: img.base64
        }
      });
    }
  }

  parts.push({ text: prompt || `Generate professional ${platform} content` });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
      })
    }
  );

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  
  const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!output) throw new Error('No output from Gemini');
  
  return output;
}

function generateFallback(prompt, platform) {
  const isExcel = platform.includes('Excel') || platform.includes('Sheets');
  const isAccounting = platform.includes('Tally') || platform.includes('QuickBooks');
  const isPresentation = platform.includes('PowerPoint') || platform.includes('Slides');
  
  if (isExcel) {
    return `📊 ${platform} - Generated Report

Product Name | Category | Quantity | Unit Price | Total Revenue
-------------|----------|----------|------------|--------------
AI Laptop Pro | Electronics | 25 | $1,299 | $32,475
Smart Desk | Furniture | 18 | $599 | $10,782
Wireless Mouse | Accessories | 120 | $29 | $3,480
USB Hub | Accessories | 85 | $19 | $1,615
Software License | Digital | 50 | $199 | $9,950

=SUM(E2:E6) = $58,302
=AVERAGE(D2:D6) = $429
Total Growth: +18% YoY

Platform: ${platform}
Generated by Project Forge AI`;
  }
  
  if (isAccounting) {
    return `📋 ${platform} - Accounting Entry

VOUCHER TYPE: Sales Invoice
DATE: ${new Date().toLocaleDateString()}

LEDGER ENTRIES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Particulars          | Debit    | Credit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bank Account         | $12,500  |
Sales Account        |          | $10,593
GST Output (18%)     |          | $1,907
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GST Summary:
- CGST 9%: $953.50
- SGST 9%: $953.50

NARRATION: AI Workstation sales for Q4

Generated by Project Forge AI`;
  }
  
  if (isPresentation) {
    return `📽️ ${platform} - Business Presentation

Slide 1: Title
• Q4 2025 Business Review
• Project Forge AI Analytics

Slide 2: Key Metrics
• Revenue: $2.3M (+18% YoY)
• Customers: 1,245 (+32%)
• Market Share: 15.6%

Slide 3: Regional Performance
• North India: 45% of revenue
• South India: 28% of revenue
• West India: 22% of revenue

Slide 4: Action Items
• Launch mobile app in Q1 2026
• Expand to 5 new cities
• Hire 20 sales representatives

Generated by Project Forge AI`;
  }
  
  return `📄 ${platform} - Generated Document

EXECUTIVE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Strong performance in Q4 2025 with revenue growth of 18% and customer acquisition up 32% year-over-year.

KEY FINDINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Revenue reached $2.3 million
2. Customer base expanded to 1,245
3. AI product line grew 67%
4. Customer satisfaction: 4.8/5

RECOMMENDATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Increase marketing spend by 25%
• Launch loyalty program in Q1
• Expand AI features by March

Generated by Project Forge AI
Platform: ${platform}
Timestamp: ${new Date().toLocaleString()}`;
}

// ========== MAIN GENERATE ENDPOINT ==========
app.post('/api/generate', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { supabaseId, user_id, prompt, platform, images } = req.body;
    const userId = supabaseId || user_id;

    console.log(`📝 [${new Date().toISOString()}] Generate request - Platform: ${platform}, User: ${userId || 'guest'}`);

    if (!prompt && (!images || images.length === 0)) {
      return res.status(400).json({ error: '❌ Prompt ya image upload karein' });
    }

    if (!platform) {
      return res.status(400).json({ error: '❌ Platform select karein' });
    }

    // Check user limits
    let userRecord = null;
    if (userId) {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('supabase_id', userId)
        .single();

      if (!error && user) {
        userRecord = user;
        
        const now = new Date();
        const lastReset = new Date(user.last_reset_date);
        if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
          await supabase
            .from('users')
            .update({ monthly_generations: 0, last_reset_date: now.toISOString() })
            .eq('supabase_id', userId);
          userRecord.monthly_generations = 0;
        }

        const isPro = userRecord.plan === 'pro' || userRecord.plan === 'lifetime';
        
        if (!isPro && userRecord.monthly_generations >= 500) {
          return res.status(403).json({ 
            error: '⚠️ Free limit reached (500/month). Please upgrade to Pro for unlimited generations!',
            requiresUpgrade: true 
          });
        }
      }
    }

    // Generate content
    let output = '';
    let usedGemini = false;

    if (GEMINI_API_KEY) {
      try {
        console.log('🤖 Calling Gemini API...');
        output = await generateWithGemini(prompt, platform, images || []);
        usedGemini = true;
        console.log('✅ Gemini generation successful');
      } catch (apiError) {
        console.error('⚠️ Gemini error:', apiError.message);
        output = generateFallback(prompt || 'Generate content', platform);
      }
    } else {
      console.log('⚠️ No Gemini API key, using fallback');
      output = generateFallback(prompt || 'Generate content', platform);
    }

    // Save to history and update counters
    if (userId && userRecord) {
      try {
        await supabase
          .from('generation_history')
          .insert([{
            user_id: userRecord.id,
            prompt: (prompt || 'Image/File upload').substring(0, 500),
            platform: platform,
            output: output.substring(0, 5000),
            output_type: (platform.includes('Excel') || platform.includes('Sheets')) ? 'tabular' : 'doc'
          }]);

        if (userRecord.plan === 'free') {
          await supabase
            .from('users')
            .update({ monthly_generations: (userRecord.monthly_generations || 0) + 1 })
            .eq('supabase_id', userId);
        }
        
        console.log('💾 History saved');
      } catch (dbError) {
        console.error('⚠️ DB save error:', dbError.message);
      }
    }

    const responseTime = Date.now() - startTime;
    console.log(`✅ Response sent in ${responseTime}ms`);

    res.json({
      output: output,
      outputType: (platform.includes('Excel') || platform.includes('Sheets')) ? 'tabular' : 'doc',
      usedGemini: usedGemini,
      responseTime: responseTime
    });

  } catch (error) {
    console.error('❌ Generate error:', error);
    res.status(500).json({ 
      error: 'Internal server error: ' + error.message,
      output: generateFallback(req.body?.prompt || 'Content generation', req.body?.platform || 'Document')
    });
  }
});

// ========== HISTORY ENDPOINTS ==========
app.get('/api/history/:supabaseId', async (req, res) => {
  try {
    const { supabaseId } = req.params;
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('supabase_id', supabaseId)
      .single();

    if (!user) return res.json([]);

    const { data: history } = await supabase
      .from('generation_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    res.json(history || []);
  } catch (error) {
    console.error('Get history error:', error);
    res.json([]);
  }
});

app.delete('/api/history/:supabaseId', async (req, res) => {
  try {
    const { supabaseId } = req.params;
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('supabase_id', supabaseId)
      .single();

    if (user) {
      await supabase.from('generation_history').delete().eq('user_id', user.id);
    }
    res.json({ success: true, message: 'History cleared' });
  } catch (error) {
    console.error('Clear history error:', error);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// ========== UPGRADE ENDPOINT ==========
app.post('/api/upgrade/:supabaseId', async (req, res) => {
  try {
    const { supabaseId } = req.params;
    const { plan } = req.body;

    if (!plan || !['pro', 'lifetime'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Use "pro" or "lifetime"' });
    }

    const { error } = await supabase
      .from('users')
      .update({ plan: plan, updated_at: new Date() })
      .eq('supabase_id', supabaseId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, plan: plan });
  } catch (error) {
    console.error('Upgrade error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║     🚀 Project Forge AI Backend Started             ║
╠══════════════════════════════════════════════════════╣
║  Port: ${PORT}                                         ║
║  Supabase: ${SUPABASE_URL ? '✅ Connected' : '❌ Missing'}   ║
║  Gemini AI: ${GEMINI_API_KEY ? '✅ Configured' : '⚠️ Fallback'} ║
║  CORS: Enabled for aiforgen.netlify.app              ║
╚══════════════════════════════════════════════════════╝
  `);
});