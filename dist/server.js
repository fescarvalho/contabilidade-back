"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv")); // 1. O dotenv vem PRIMEIRO
dotenv_1.default.config(); // 2. Carrega as senhas IMEDIATAMENTE
// 3. Só agora importamos o resto
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const docs_routes_1 = __importDefault(require("./routes/docs.routes"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
const limiter = (0, express_rate_limit_1.default)({
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
    'http://localhost:5173' // Para você testar localmente
];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'A política de CORS deste site não permite acesso desta origem.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express_1.default.json());
app.use(auth_routes_1.default);
app.use(docs_routes_1.default);
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`SERVIDOR RODANDO NA PORTA ${PORT} 🚀`);
});
