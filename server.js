import "dotenv/config";
import express from "express";
import cors from 'cors';
import { jwtVerify, importJWK } from 'jose';
import cookieParser from 'cookie-parser';
import { createClient } from "@supabase/supabase-js";

const allowedOrigins = ['https://hchan07.github.io','https://my-project.dev', 'https://dev.my-project.dev'];

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const RAW_SUPABASE_PUBLIC_KEY = process.env.RAW_SUPABASE_PUBLIC_KEY;

if (!RAW_SUPABASE_PUBLIC_KEY) {
  throw new Error("Missing SUPABASE_PUBLIC_KEY environment variable");
}

const SUPABASE_PUBLIC_KEY = JSON.parse(RAW_SUPABASE_PUBLIC_KEY);

// Configure CORS options
const corsOptions = {  
  origin: function (origin, callback) {
    // Check if the origin is in the allowed list or is a same-origin request
    if (allowedOrigins.indexOf(origin) !== -1 || !origin || true) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true // Set to true if you need to handle cookies/sessions
};

const app = express();
// Enable CORS for all routes using the configured options
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

const cookieOptions = {
  path: '/',
  httpOnly: true,
  secure: true,      // Set to true if using HTTPS (standard for Supabase)
  sameSite: 'none',   // Usually 'lax' for Supabase, but check your login code
};


app.post('/api/signup', async (req, res) => {
  // 1. Express handles body parsing via middleware, no need for req.json()  
  const { email, password, fullName } = req.body;
  
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email,
        password,
        data: { full_name: fullName }
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Send error back using Express syntax
      return res.status(response.status || 400).json(data);
    }

    // 2. Extract tokens
    const { access_token, refresh_token } = data;


    // Note: maxAge is in milliseconds in Express (3600s * 1000)
    if (access_token) {
      res.cookie('sb-access-token', access_token, { 
        ...cookieOptions, 
        maxAge: 3600 * 1000 // 1 hour
      });
    }

    if (refresh_token) {
      res.cookie('sb-refresh-token', refresh_token, { 
        ...cookieOptions, 
        maxAge: 604800 * 1000 
      });
    }

    // 4. Send final success response
    return res.status(200).json({ message: "Signed up and cookies set!" });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    // 1. Call Supabase Auth API to exchange password for tokens
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error_description || data.error });
    }

    // 2. Extract tokens from Supabase response
    const { access_token, refresh_token, user } = data;

    // 3. Set the HttpOnly cookies
    // Access token (shorter life)
    res.cookie('sb-access-token', access_token, {
      ...cookieOptions, 
      maxAge: 3600 * 1000 // 1 hour
    });

    // Refresh token (longer life)
    res.cookie('sb-refresh-token', refresh_token, {
      ...cookieOptions, 
      maxAge: 604800 * 1000 
    });
  
    // 4. Send success back to React (don't send tokens in JSON!)
    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.user_metadata?.full_name
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/me', async (req, res) => {
  const token = req.cookies['sb-access-token'];

  // 1. If no cookie exists, the user is definitely not logged in
  if (!token) {
    return res.status(401).json({ authenticated: false, user: null });
  }
try {
    // 2. Import your Public Key (fetched from .well-known/jwks.json)

    const EC_PUBLIC_KEY = await importJWK(SUPABASE_PUBLIC_KEY, 'ES256');

    // 3. Verify the JWT claims locally
    const { payload } =  await jwtVerify(token, EC_PUBLIC_KEY, {
      algorithms: ['ES256'],
      audience: 'authenticated',
    });

    // 4. Return the user data to the frontend
    // We only send what the UI needs to display (name, email, etc.)
    return res.status(200).json({
      authenticated: true,
      user: {
        id: payload.sub,
        email: payload.email,
        fullName: payload.user_metadata?.full_name,
        role: payload.role
      }
    });

  } catch (err) {
    // 5. If verification fails (expired or tampered), treat as unauthenticated
    console.error('Auth check failed:', err.message);
    return res.status(401).json({ authenticated: false, user: null });
  }  
})

app.post('/api/logout', async (req, res) => {
  const accessToken = req.cookies['sb-access-token'];
  const response = await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Logout failed:', errorData);
  } else {
    console.log('Session invalidated in Supabase');
  }
  // Clear the access token
  res.clearCookie('sb-access-token', {...cookieOptions} );
  
  // Clear the refresh token
  res.clearCookie('sb-refresh-token', {...cookieOptions} );

  return res.status(200).json({ 
    success: true, 
    message: 'Tokens cleared successfully' 
  });
});


app.get("/api", (req, res) => {
	res.json({'fruits': ['apple', 'orange', 'banana', "cherry"]
	});
});


app.listen(3000, () => {
	console.log("Server started on 3000")
})