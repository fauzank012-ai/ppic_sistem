import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured) {
  console.error('Missing Supabase URL or Key. Please check your .env file.');
}

// Prevent crash if variables are missing by using placeholders
// This allows the app to load, but Supabase calls will fail until valid credentials are provided in .env
const url = supabaseUrl || 'https://placeholder.supabase.co';
const key = supabaseKey || 'placeholder-key';

export const supabase = createClient(url, key);

export const fetchAllRows = async (table: string, selectQuery: string = '*', filters?: (query: any) => any) => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Please check your environment variables.');
  }
  
  let allData: any[] = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from(table)
      .select(selectQuery)
      .range(from, from + step - 1);
    
    if (filters) {
      query = filters(query);
    }

    try {
      const { data, error } = await query;

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += step;
        if (data.length < step) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    } catch (err) {
      console.error(`Error fetching from ${table}:`, err);
      throw err;
    }
  }

  return allData;
};

export const fetchRows = async (table: string, from: number, to: number, selectQuery: string = '*', filters?: (query: any) => any) => {
  let query = supabase
    .from(table)
    .select(selectQuery)
    .range(from, to);
  
  if (filters) {
    query = filters(query);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`Error fetching from ${table}:`, error);
    throw error;
  }

  return data;
};

export const insertInChunks = async (table: string, data: any[], chunkSize = 1000) => {
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) {
      console.error(`Error inserting chunk into ${table}:`, error);
      throw error;
    }
  }
};

export const upsertInChunks = async (table: string, data: any[], onConflict: string, chunkSize = 1000) => {
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) {
      console.error(`Error upserting chunk into ${table}:`, error);
      throw error;
    }
  }
};

export const fetchFromBackend = async (endpoint: string, options: { method?: string; body?: any; params?: Record<string, any> } = {}) => {
  const url = new URL(endpoint, window.location.origin);
  const { method = 'GET', body, params = {} } = options;

  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      url.searchParams.append(key, params[key]);
    }
  });
  
  const response = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_API_KEY || ''
    },
    body: body ? JSON.stringify(body) : undefined
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${response.statusText}`);
  }
  
  return response.json();
};
