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
 * Puente: Frontend -> Vercel -> SQL Server
 * POST: Sincronización masiva (Subir Excel)
 */
app.post('/api/clientes/sync', async (req, res) => {
  try {
    console.log('[Puente Vercel] Recibiendo petición de subida masiva...');

    const response = await fetch(`${SQL_API_URL}/clientes/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      throw new Error(`Error del servidor SQL: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Respuesta de SQL recibida correctamente.');
    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Error en puente (Sync POST):', error);
    res.status(500).json({
      error:
        'Fallo al conectar con el servidor de la empresa para sincronizar.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API Puente corriendo en http://localhost:${PORT}`);
});

export default app;
