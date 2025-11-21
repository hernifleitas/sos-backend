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
  [-34.79420, -58.44880],
  [-34.79420, -58.44650],
  [-34.79620, -58.44650],
  [-34.79620, -58.44880]
]
    },

    // Zona peligrosa
    {
      id: 2,
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

     // Zona peligrosa
    {
      id: 3,
      nombre: 'Zona peligrosa',
      descripcion: 'Zona con reportes de robos frecuentes.',
      tipo: 'peligrosa',
coordenadas: [
  [-34.80980, -58.43715],  // Noroeste
  [-34.80980, -58.43676],  // Noreste
  [-34.81025, -58.43676],  // Sureste
  [-34.81025, -58.43715]   // Suroeste
]
    },
    // Local No devuelve efectivo - Mr Tasty Montegrande
    {
      id: 4,
      nombre: 'Mr Tasty',
      descripcion: 'Local que no devuelve efectivo a repartidores',
      tipo: 'sin-efectivo',
      coordenadas: [
        [-34.81510, -58.46895],
        [-34.81510, -58.46885],
        [-34.81520, -58.46885],
        [-34.81520, -58.46895]
      ]
    },
    // Zona peligrosa
    {
      id: 5,
      nombre: 'Zona peligrosa',
      descripcion: 'Zona con reportes de robos frecuentes.',
      tipo: 'peligrosa',
coordenadas: [
  [-34.80850, -58.42745],  // Noroeste
  [-34.80850, -58.42680],  // Noreste
  [-34.80795, -58.42680],  // Sureste
  [-34.80795, -58.42745]   // Suroeste
]
    },

    // Zona peligrosa
    {
      id: 6,
      nombre: 'Zona peligrosa',
      descripcion: 'Zona con reportes de robos frecuentes.',
      tipo: 'peligrosa',
coordenadas: [
  [-34.80463, -58.43936],
  [-34.80478, -58.43889],
  [-34.80510, -58.43870],
  [-34.80545, -58.43890],
  [-34.80562, -58.43936],
  [-34.80545, -58.43982],
  [-34.80510, -58.44002],
  [-34.80478, -58.43983]
]
    },

    // Zona peligrosa
    {
      id: 7,
      nombre: 'Zona peligrosa',
      descripcion: 'Zona con reportes de robos frecuentes.',
      tipo: 'peligrosa',
coordenadas: [
  [-34.82863, -58.44033],  // Noroeste
  [-34.82863, -58.43935],  // Norte
  [-34.82913, -58.43885],  // Noreste
  [-34.82963, -58.43935],  // Este
  [-34.82963, -58.44033],  // Sureste
  [-34.82913, -58.44083],  // Sur
  [-34.82863, -58.44033],  // Suroeste
  [-34.82863, -58.43935]   // Oeste
]
    },

     // Local No devuelve efectivo - Mr Tasty Montegrande
    {
      id: 8,
      nombre: 'Helados kupanaka',
      descripcion: 'Local que no devuelve efectivo a repartidores',
      tipo: 'sin-efectivo',
    coordenadas: [
  [-34.81888, -58.47378],  // Noroeste
  [-34.81888, -58.47342],  // Noreste
  [-34.81898, -58.47342],  // Sureste
  [-34.81898, -58.47378]   // Suroeste
]
    },

  ];

  
  res.json({ success: true, zonas });
});

module.exports = router;
