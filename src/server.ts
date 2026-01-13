import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import docsRoutes from "./routes/docs.routes";

dotenv.config();

const app = express();

// Configurações Globais
app.use(express.json());
app.use(cors());

// Registrando as Rotas
app.use(authRoutes);
app.use(docsRoutes);

// Rota de Saúde
app.get("/", (req, res) => {
  res.send("API Leandro Contabilidade está ON! 🚀");
});

// Inicialização
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SERVIDOR ORGANIZADO RODANDO NA PORTA ${PORT} 🚀`);
});
