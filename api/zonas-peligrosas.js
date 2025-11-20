// GET /api/zonas-peligrosas
router.get('/', (req, res) => {
  const zonas = [
    {
      id: 1,
      nombre: 'Cruce peligroso',
      descripcion: '<strong>¡Atención!</strong><br>Zona con reportes de robos frecuentes en semáforos.',
      color: '#E74C3C', // Rojo
      coordenadas: [
        [-34.8215, -58.4680],
        [-34.8225, -58.4660],
        [-34.8205, -58.4640],
        [-34.8195, -58.4670]
      ]
    },
    {
      id: 2,
      nombre: 'Zona comercial concurrida',
      descripcion: '<strong>Precaución</strong><br>Alto tráfico y riesgo de arrebatos.',
      color: '#F39C12',
      coordenadas: [
        [-34.8150, -58.4700],
        [-34.8160, -58.4680],
        [-34.8140, -58.4660]
      ]
    }
  ];
  res.json({ success: true, zonas });
});