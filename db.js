// db.js
require("dotenv").config();
const { Pool } = require("pg");

// Cria a conexão usando a variável do .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Teste rápido para ver se conectou quando o servidor subir
pool.on("connect", () => {
  console.log("BASE DE DADOS CONECTADA COM SUCESSO!");
});

pool.on("error", (err) => {
  console.error("ERRO INESPERADO NO BANCO:", err);
  process.exit(-1);
});

// Exporta "query" para podermos usar em outros arquivos
module.exports = {
  query: (text, params) => pool.query(text, params),
};
