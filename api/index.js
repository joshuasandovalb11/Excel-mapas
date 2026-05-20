import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage() });
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

/**
 * Puente: GET /api/visualizador/rutas/fechas
 * Obtiene las fechas disponibles de rutas
 */
app.get('/api/visualizador/rutas/fechas', async (req, res) => {
  try {
    console.log(
      `[Puente] Solicitando fechas disponibles a: ${SQL_API_URL}/visualizador/rutas/fechas`
    );

    const response = await fetch(`${SQL_API_URL}/visualizador/rutas/fechas`);

    if (!response.ok) {
      throw new Error(
        `El servidor SQL respondió con error: ${response.status}`
      );
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error(
      '❌ Error en GET /api/visualizador/rutas/fechas:',
      error.message
    );
    res.status(500).json({
      error: 'No se pudo obtener las fechas disponibles.',
      details: error.message,
    });
  }
});

/**
 * Puente: GET /api/visualizador/rutas
 * Obtiene resumen de rutas con filtros opcionales
 * Query params: fecha, vendedor, limite
 */
app.get('/api/visualizador/rutas', async (req, res) => {
  try {
    const { fecha, vendedor, limite } = req.query;
    const queryParams = new URLSearchParams();

    if (fecha) queryParams.append('fecha', fecha);
    if (vendedor) queryParams.append('vendedor', vendedor);
    if (limite) queryParams.append('limite', limite);

    const url = `${SQL_API_URL}/visualizador/rutas${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    console.log(`[Puente] Solicitando rutas a: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `El servidor SQL respondió con error: ${response.status}`
      );
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Error en GET /api/visualizador/rutas:', error.message);
    res.status(500).json({
      error: 'No se pudieron obtener las rutas.',
      details: error.message,
    });
  }
});

/**
 * Puente: GET /api/visualizador/rutas/:id_ruta
 * Obtiene detalle de una ruta específica
 * Query params: incluirClientes, minStopDuration
 */
app.get('/api/visualizador/rutas/:id_ruta', async (req, res) => {
  try {
    const { id_ruta } = req.params;
    const { incluirClientes, minStopDuration } = req.query;
    const queryParams = new URLSearchParams();

    if (incluirClientes) queryParams.append('incluirClientes', incluirClientes);
    if (minStopDuration) queryParams.append('minStopDuration', minStopDuration);

    const url = `${SQL_API_URL}/visualizador/rutas/${id_ruta}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    console.log(`[Puente] Solicitando detalle de ruta a: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `El servidor SQL respondió con error: ${response.status}`
      );
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error(
      '❌ Error en GET /api/visualizador/rutas/:id_ruta:',
      error.message
    );
    res.status(500).json({
      error: 'No se pudo obtener el detalle de la ruta.',
      details: error.message,
    });
  }
});

/**
 * Puente: POST /api/visualizador/rutas/excel
 * Sube un archivo Excel y lo procesa en el backend
 */
app.post(
  '/api/visualizador/rutas/excel',
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ningún archivo' });
      }

      const { incluirClientes, minStopDuration } = req.query;
      const queryParams = new URLSearchParams();

      if (incluirClientes)
        queryParams.append('incluirClientes', incluirClientes);
      if (minStopDuration)
        queryParams.append('minStopDuration', minStopDuration);

      const url = `${SQL_API_URL}/visualizador/rutas/excel${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
      console.log(`[Puente] Traduciendo y enviando Excel a: ${url}`);

      const formData = new FormData();
      const blob = new Blob([req.file.buffer], { type: req.file.mimetype });

      formData.append('archivoExcel', blob, req.file.originalname);

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(
          `El servidor SQL respondió con error: ${response.status}`
        );
      }

      const data = await response.json();
      res.status(200).json(data);
    } catch (error) {
      console.error(
        '❌ Error en POST /api/visualizador/rutas/excel:',
        error.message
      );
      res.status(500).json({
        error: 'No se pudo procesar el archivo Excel.',
        details: error.message,
      });
    }
  }
);

/**
 * Puente: GET /api/vendedores
 * Obtiene el catálogo de vendedores
 */
app.get('/api/visualizador/vendedores', async (req, res) => {
  try {
    console.log(
      `[Puente] Solicitando vendedores a: ${SQL_API_URL}/visualizador/vendedores`
    );

    const response = await fetch(`${SQL_API_URL}/visualizador/vendedores`);

    if (!response.ok) {
      throw new Error(
        `El servidor SQL respondió con error: ${response.status}`
      );
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error(
      '❌ Error en GET /api/visualizador/vendedores:',
      error.message
    );
    res.status(500).json({
      error: 'No se pudo obtener el catálogo de vendedores.',
      details: error.message,
    });
  }
});

/**
 * Puente: GET /api/visualizador/behavior
 * Obtiene el patrón de conducta analítico
 */
app.get('/api/visualizador/behavior', async (req, res) => {
  try {
    const { vendedor, startDate, endDate, minStopDuration } = req.query;
    const queryParams = new URLSearchParams();

    if (vendedor) queryParams.append('vendedor', vendedor);
    if (startDate) queryParams.append('startDate', startDate);
    if (endDate) queryParams.append('endDate', endDate);
    if (minStopDuration) queryParams.append('minStopDuration', minStopDuration);

    const url = `${SQL_API_URL}/visualizador/behavior${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    console.log(`[Puente] Solicitando patrón de conducta a: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `El servidor SQL respondió con error: ${response.status}`
      );
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Error en GET /api/visualizador/behavior:', error.message);
    res.status(500).json({
      error: 'No se pudo obtener el patrón de conducta.',
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API Puente corriendo en http://localhost:${PORT}`);
});

export default app;
