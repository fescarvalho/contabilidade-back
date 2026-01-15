import dotenv from 'dotenv'; // 1. O dotenv vem PRIMEIRO
dotenv.config();             // 2. Carrega as senhas IMEDIATAMENTE

// 3. Só agora importamos o resto
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import docsRoutes from './routes/docs.routes';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

const app = express();
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limite de 100 requisições por IP
  standardHeaders: true, // Retorna info de limite nos headers `RateLimit-*`
  legacyHeaders: false, // Desabilita headers antigos `X-RateLimit-*`
  message: "Muitas tentativas de acesso vindas deste IP, tente novamente em 15 minutos."
});
app.set('trust proxy', 1);

app.use(limiter);

const allowedOrigins = [
  'https://leandro-abreu-contabilidade.vercel.app', 
  'http://localhost:8080' // Para você testar localmente
];
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

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`SERVIDOR RODANDO NA PORTA ${PORT} 🚀`);
});