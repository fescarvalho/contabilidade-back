import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não definida no .env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("connect", () => {
  console.log("BASE DE DADOS CONECTADA COM SUCESSO!");
});

pool.on("error", (err) => {
  console.error("ERRO INESPERADO NO BANCO:", err);
  process.exit(-1);
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
};
