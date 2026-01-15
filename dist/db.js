"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const pg_1 = require("pg");
// --- SOLUÇÃO DIRETA ---
// Cole a URL do Neon aqui dentro das aspas (a mesma que funcionou no teste)
const CONNECTION_STRING = process.env.DATABASE_URL;
exports.pool = new pg_1.Pool({
    connectionString: CONNECTION_STRING,
    ssl: true
});
// Teste rápido ao iniciar para garantir
exports.pool.query('SELECT NOW()')
    .then(() => console.log("✅ BANCO CONECTADO COM SUCESSO VIA DB.TS"))
    .catch(err => console.error("❌ ERRO DE CONEXÃO:", err));
