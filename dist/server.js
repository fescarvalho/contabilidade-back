"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const docs_routes_1 = __importDefault(require("./routes/docs.routes"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// 1. Importações necessárias para o Socket
const http_1 = require("http");
const socket_io_1 = require("socket.io");
BigInt.prototype.toJSON = function () {
    return Number(this);
};
const app = (0, express_1.default)();
// 2. Criamos o servidor HTTP "cru" passando o Express para ele
const httpServer = (0, http_1.createServer)(app);
app.use((0, helmet_1.default)());
const limiter = (0, express_rate_limit_1.default)({
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
    'http://localhost:5173' // Adicionei o padrão do Vite/React
];
// 4. Configuração do Socket.io
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: allowedOrigins, // O Socket usa a mesma lista de domínios
        methods: ["GET", "POST"]
    }
});
exports.io = io;
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
app.set('trust proxy', 1);
app.use(limiter);
// Configuração de CORS do Express
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
const PORT = process.env.PORT || 3000;
// 7. IMPORTANTE: Trocamos app.listen por httpServer.listen
if (process.env.NODE_ENV !== 'production') {
    httpServer.listen(PORT, () => {
        console.log(`🚀 SERVIDOR RODANDO LOCALMENTE NA PORTA ${PORT}`);
    });
}
exports.default = app;
