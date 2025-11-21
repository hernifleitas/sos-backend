const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const zonas = [
    // Zona peligrosa
    {
      id: 1,
      nombre: 'Zona peligrosa',
      descripcion: 'Zona con reportes de robos frecuentes.',
      tipo: 'peligrosa',
    coordenadas: [
  [-34.82530, -58.45955],
  [-34.82530, -58.45850],
  [-34.82640, -58.45850],
  [-34.82640, -58.45955]
]
    },
    // Local sin efectivo - Mr Tasty Montegrande
    {
      id: 2,
      nombre: 'Mr Tasty',
      descripcion: 'Local que no devuelve efectivo a repartidores',
      tipo: 'sin-efectivo',
      coordenadas: [
        [-34.81510, -58.46895],
        [-34.81510, -58.46885],
        [-34.81520, -58.46885],
        [-34.81520, -58.46895]
      ]
    }
  ];
  res.json({ success: true, zonas });
});

module.exports = router;
