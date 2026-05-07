import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const SQL_API_URL = process.env.SQL_API_URL || 'http://localhost:3001/api';
const PORT = process.env.PORT || 3000;

console.log(`[Config] API SQL Remota: ${SQL_API_URL}`);

/**
 * Puente: Frontend -> Vercel -> SQL Server
 * GET: Obtener lista de clientes
 */
app.get('/api/clientes', async (req, res) => {
  try {
    console.log(`[Puente Vercel] Solicitando datos a: ${SQL_API_URL}/clientes`);

    const response = await fetch(`${SQL_API_URL}/clientes`);

    if (!response.ok) {
      throw new Error(
        `El servidor SQL respondió con error: ${response.status}`
      );
    }

    const data = await response.json();
    console.log(
      `✅ [Puente Vercel] Recibidos ${data.length} registros. Reenviando al frontend.`
    );

    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Error en el Puente (GET):', error.message);
    res.status(500).json({
      error: 'No se pudo conectar con el servidor de la empresa.',
      details: error.message,
    });
  }
});

/**
 * Puente: Health Check
 * Verifica conexión end-to-end (Frontend -> Vercel -> SQL Server)
 */
app.get('/api/health', async (req, res) => {
  try {
    const response = await fetch(`${SQL_API_URL}/health`);

    if (!response.ok) {
      throw new Error(`SQL Server responde con error: ${response.status}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ status: 'OFFLINE', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API Puente corriendo en http://localhost:${PORT}`);
});

export default app;
