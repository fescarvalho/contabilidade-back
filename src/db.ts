import { Pool } from 'pg';

// --- SOLUÇÃO DIRETA ---
// Cole a URL do Neon aqui dentro das aspas (a mesma que funcionou no teste)
const CONNECTION_STRING = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString: CONNECTION_STRING,
  ssl: true
});

// Teste rápido ao iniciar para garantir
pool.query('SELECT NOW()')
  .then(() => console.log("✅ BANCO CONECTADO COM SUCESSO VIA DB.TS"))
  .catch(err => console.error("❌ ERRO DE CONEXÃO:", err));