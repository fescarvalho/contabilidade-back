import dotenv from 'dotenv'; // 1. O dotenv vem PRIMEIRO
dotenv.config();             // 2. Carrega as senhas IMEDIATAMENTE

// 3. Só agora importamos o resto
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import docsRoutes from './routes/docs.routes';

const app = express();
app.use((req, res, next) => {
  // 1. Quem pode acessar (Seu Frontend)
  res.header("Access-Control-Allow-Origin", "https://leandro-abreu-contabilidade.vercel.app");
  
  // 2. Métodos permitidos
  res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
  
  // 3. Cabeçalhos permitidos
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  
  // 4. A MÁGICA: Se for o "Preflight" (OPTIONS), responde 200 OK na hora e encerra!
  if (req.method === 'OPTIONS') {
      res.status(200).send();
      return; 
  }
  
  next(); // Se não for OPTIONS, segue para as rotas normais
});

app.use(express.json());
app.use(authRoutes);
app.use(docsRoutes);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`SERVIDOR RODANDO NA PORTA ${PORT} 🚀`);
});