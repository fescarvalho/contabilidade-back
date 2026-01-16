import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import docsRoutes from './routes/docs.routes';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
// 1. Importações necessárias para o Socket
import { createServer } from 'http';
import { Server } from 'socket.io';

(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

const app = express();
// 2. Criamos o servidor HTTP "cru" passando o Express para ele
const httpServer = createServer(app);

app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Muitas tentativas de acesso vindas deste IP, tente novamente em 15 minutos."
});

// 3. Lista de origens permitidas (Centralizada para usar no Express e no Socket)
const allowedOrigins = [
  'https://leandro-abreu-contabilidade.vercel.app',
  'http://localhost:8080', // Seu teste local
  'http://localhost:5173'  // Adicionei o padrão do Vite/React
];

// 4. Configuração do Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins, // O Socket usa a mesma lista de domínios
    methods: ["GET", "POST"]
  }
});

// 5. Lógica de conexão do Socket
io.on("connection", (socket) => {
  console.log(`🔌 Cliente conectado no Socket: ${socket.id}`);

  // O cliente (Frontend) vai pedir para entrar na sala dele: "join_room", 10
  socket.on("join_room", (userId) => {
    if (userId) {
      const roomName = `user_${userId}`;
      socket.join(roomName);
      console.log(`👤 Usuário ${userId} entrou na sala ${roomName}`);
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Cliente desconectou.");
  });
});

// 6. EXPORTE O IO para poder usar nos controllers/rotas
export { io };

app.set('trust proxy', 1);
app.use(limiter);

// Configuração de CORS do Express
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'A política de CORS deste site não permite acesso desta origem.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(authRoutes);
app.use(docsRoutes);

const PORT = process.env.PORT || 3000;

// 7. IMPORTANTE: Trocamos app.listen por httpServer.listen
httpServer.listen(PORT, () => {
  console.log(`🚀 SERVIDOR + SOCKET RODANDO NA PORTA ${PORT}`);
});