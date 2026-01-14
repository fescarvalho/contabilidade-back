import dotenv from 'dotenv'; // 1. O dotenv vem PRIMEIRO
dotenv.config();             // 2. Carrega as senhas IMEDIATAMENTE

// 3. Só agora importamos o resto
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import docsRoutes from './routes/docs.routes';

const app = express();
app.use(express.json());
app.use(cors({
  origin: ["https://seu-frontend.vercel.app", "http://localhost:5173"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(authRoutes);
app.use(docsRoutes);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`SERVIDOR RODANDO NA PORTA ${PORT} 🚀`);
});