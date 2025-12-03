const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const zonas = [
    // Zona peligrosa
    {
      id: "Las heras y ascasubi",
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
      id: "Peya Market",
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
      id: "Fischer",
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
      id: "lOCAL MR TASTY",
      nombre: 'Mr Tasty',
      descripcion: 'Leandro N. Alem 108',
      tipo: 'sin-efectivo',
      coordenadas: [
        [-34.81510, -58.46895],
        [-34.81510, -58.46885],
        [-34.81520, -58.46885],
        [-34.81520, -58.46895]
      ]
    },

     {
      id: "local no devuelve efe",
      nombre: 'Valence',
      descripcion: 'Av. Dardo Rocha 220',
      tipo: 'sin-efectivo',
coordenadas: [
  [-34.80055426866908, -58.47198486048862]
]
    },
    // Zona peligrosa
    {
      id: "Lujan",
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
      id: "Rotonda Lavallol y aproximado",
      nombre: 'Zona peligrosa',
      descripcion: 'Zona con reportes de robos frecuentes.',
      tipo: 'peligrosa',
coordenadas: [
  [-34.801188046714785, -58.43771037959036],
  [-34.80121109182997, -58.43828168643225],
  [-34.80128000527692, -58.438847492227616],
  [-34.8013941234953, -58.439402348871475],
  [-34.80155234764914, -58.43994091363354],
  [-34.80175315420217, -58.440458000579206],
  [-34.80199460958061, -58.440948630484634],
  [-34.802274388783076, -58.44140807876605],
  [-34.802589797758216, -58.441831920962784],
  [-34.802937799335496, -58.442216075336546],
  [-34.8033150424598, -58.44255684217729],
  [-34.80371789444901, -58.442850939436866],
  [-34.80414247596416, -58.44309553434771],
  [-34.80458469835643, -58.4432882707212],
  [-34.80504030303132, -58.443427291662275],
  [-34.80550490245174, -58.44351125748078],
  [-34.8059740223852, -58.44353935862574],
  [-34.80644314498885, -58.44351132351688],
  [-34.80690775231717, -58.44342742119676],
  [-34.807363369833844, -58.4432884587761],
  [-34.80780560950823, -58.4430957736962],
  [-34.808230212081696, -58.44285122088091],
  [-34.808633088096165, -58.442557154901166],
  [-34.80901035728941, -58.44221640732246],
  [-34.80935838597746, -58.44183225945266],
  [-34.80967382206338, -58.441408410751954],
  [-34.80995362733478, -58.44094894320851],
  [-34.81019510673848, -58.440458282023265],
  [-34.81039593434983, -58.43994115298203],
  [-34.81055417578578, -58.43940253692639],
  [-34.81066830684594, -58.43884762176209],
  [-34.810737228200814, -58.43828175246835],
  [-34.81076027598618, -58.43771037959036],
  [-34.810737228200814, -58.43713900671236],
  [-34.81066830684594, -58.43657313741861],
  [-34.81055417578578, -58.436018222254326],
  [-34.81039593434983, -58.435479606198676],
  [-34.81019510673848, -58.43496247715744],
  [-34.80995362733478, -58.434471815972195],
  [-34.80967382206338, -58.43401234842875],
  [-34.80935838597746, -58.433588499728046],
  [-34.80901035728941, -58.43320435185825],
  [-34.808633088096165, -58.43286360427954],
  [-34.808230212081696, -58.432569538299795],
  [-34.80780560950823, -58.432324985484506],
  [-34.807363369833844, -58.43213230040461],
  [-34.80690775231717, -58.431993337983954],
  [-34.80644314498885, -58.431909435663826],
  [-34.8059740223852, -58.43188140055497],
  [-34.80550490245174, -58.43190950169993],
  [-34.80504030303132, -58.43199346751843],
  [-34.80458469835643, -58.43213248845951],
  [-34.80414247596416, -58.432325224833],
  [-34.80371789444901, -58.43256981974385],
  [-34.8033150424598, -58.43286391700342],
  [-34.802937799335496, -58.43320468384415],
  [-34.802589797758216, -58.43358883821793],
  [-34.802274388783076, -58.434012680414654],
  [-34.80199460958061, -58.43447212869607],
  [-34.80175315420217, -58.43496275860149],
  [-34.80155234764914, -58.43547984554717],
  [-34.8013941234953, -58.43601841030923],
  [-34.80128000527692, -58.4365732669531],
  [-34.80121109182997, -58.43713907274846],
  [-34.801188046714785, -58.43771037959036]
]
    },

    {
      id: "Barrio ONA ",
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

      {
      id: "Lacarmon ",
      nombre: 'Zona peligrosa',
      descripcion: 'Zona con reportes de robos frecuentes.',
      tipo: 'peligrosa',
coordenadas: [
  [-34.79981590835102, -58.445592873111096],
  [-34.79973247307877, -58.445454041483146],
  [-34.798535917051446, -58.44638303958607],
  [-34.798635306035706, -58.446573030683936],
  [-34.799798790243635, -58.4455901394217]
]

    },

    {
      id: "Local no devuelve efectivo",
      nombre: 'Helados kupanaka',
      descripcion: 'General paz 199',
      tipo: 'sin-efectivo',
    coordenadas: [
  [-34.81888, -58.47378],
  [-34.81888, -58.47342],
  [-34.81898, -58.47342],
  [-34.81898, -58.47378] 
]
    },  {
      id: "local no devuelve efe",
      nombre: 'Lomiteria popular',
      descripcion: 'Emilio cardeza 162',
      tipo: 'sin-efectivo',
coordenadas: [
  [-34.81700, -58.46498],  // Noroeste
  [-34.81700, -58.46472],  // Noreste
  [-34.81718, -58.46472],  // Sureste
  [-34.81718, -58.46498]   // Suroeste
]
    },


    {
      id: "Panaderia artesanal guillon",
      nombre: 'Victorina Pastelería Artesanal',
      descripcion: 'Mendoza 199',
      tipo: 'sin-efectivo',
coordenadas: [
  [-58.447695369348494, -34.804503590448235]

]
    },

     {
      id: "Mc. Cream eduardo arana",
      nombre: 'Mc. Cream',
      descripcion: 'Eduardo arana 141',
      tipo: 'sin-efectivo',
coordenadas: [
  [-34.814548297041, -58.467291800617684],  // lat abajo, lng izquierda
  [-34.814548297041, -58.467091800617684],  // lat abajo, lng derecha
  [-34.814348297041, -58.467091800617684],  // lat arriba, lng derecha
  [-34.814348297041, -58.467291800617684]   // lat arriba, lng izquierda
]
    },

    {
      id: "Pasando Fair Pantano etc",
      nombre: 'Zona peligrosa',
      descripcion: 'Zona con reportes de robos frecuentes.',
      tipo: 'peligrosa',
coordenadas: [
  [-34.801824163054725, -58.479524403086],
  [-34.79330956615648, -58.464018357272394],
  [-34.77829189566807, -58.47482557462604],
  [-34.78555862588081, -58.49162473176496],
  [-34.801824163054725, -58.479524403086]
]
    },

     {
      id: "Primera Junta ",
      nombre: 'Zona peligrosa',
      descripcion: 'Zona con reportes de robos frecuentes.',
      tipo: 'peligrosa',
coordenadas: [
  [-34.81987503730597, -58.477871683148905],
  [-34.82187738649495, -58.48152690065332],
  [-34.81116325431051, -58.4899987825446],
  [-34.8085827260109, -58.48495304052419],
  [-34.818834026931064, -58.47704870597076]
]
    },


     {
      id: "Lavalle, carmen de areco",
      nombre: 'Zona peligrosa',
      descripcion: 'Zona con reportes de robos frecuentes.',
      tipo: 'peligrosa',
coordenadas: [
  [-34.83062890457616, -58.475902107096076],
  [-34.85104261242086, -58.460847978711016],
  [-34.84580051023779, -58.45041073345848],
  [-34.82548287058202, -58.466499469486166],
  [-34.83054517255657, -58.475965715400676]
]
    },


    {
  id: "gomeria-1",
  nombre: 'Gomería Alvear y liniers',
  descripcion: 'Servicio de parche y balanceo',
  tipo: 'gomeria',
  servicios: ['parche', 'Camaras', 'Cubiertas'],
  horario: 'Lun a Vie: 8:00 - 18:00, Sáb: 9:00 - 13:00',
  telefono: 'No disponible',
coordenadas: [
  [-34.82169603355131, -58.4535354942944],  // Noroeste
  [-34.82169603355131, -58.4533354942944],  // Noreste
  [-34.82149603355131, -58.4533354942944],  // Sureste
  [-34.82149603355131, -58.4535354942944]   // Suroeste
]
},

{
  id: "gomeria-2",
  nombre: "Gomería Valen",
  descripcion: "Servicio de parche y balanceo",
  tipo: "gomeria",
  servicios: ["parche", "cámaras", "cubiertas"],
  horario: "Lun a Sáb: 8:00AM - 12:00 AM",
  telefono: "No disponible",
  coordenadas: [
    [-34.80067877683329, -58.47351086506636]
  ]
},
{
  id: "gomeria-3",
  nombre: "Gomería Los Chicos",
  descripcion: "Servicio de parche y balanceo",
  tipo: "gomeria",
  servicios: ["parche", "cámaras", "cubiertas"],
  horario: "Lun a Vie: 8:00 - 20:00, Sáb: 8:00 - 22:30",
  telefono: "No disponible",
  coordenadas: [
    [-34.83308227640637, -58.46235376014214]
  ]
},
{
  id: "gomeria-4",
  nombre: "Gomería Alem",
  descripcion: "Servicio de parche y balanceo",
  tipo: "gomeria",
  servicios: ["parche", "cámaras", "cubiertas"],
  horario: "Lun a Vie: 9:00 - 23:30, Sáb y Dom: 8:25 - 23:30",
  telefono: "No disponible",
  coordenadas: [
    [-34.828882088778975, -58.458284139611216]
  ]
},
{
  id: "gomeria-5",
  nombre: "Gomería jesus",
  descripcion: "Servicio de parche y balanceo",
  tipo: "gomeria",
  servicios: ["parche", "cámaras", "cubiertas"],
  horario: "Lun a Vie: 8:00 - 22:00, Sáb: 8:00 - 22:30",
  telefono: "No disponible",
  coordenadas: [
    [-34.79493943128809, -58.450527442354506]
  ]
},

{
  id: "gomeria-6",
  nombre: "Gomería Lucho",
  descripcion: "Servicio de parche y balanceo",
  tipo: "gomeria",
  servicios: ["parche", "cámaras", "cubiertas"],
  horario: "Lun a Vie: 6:00 - 00:00, Sáb: 6:00 - 00:30, Dom: 6:00 - 00:00",
  telefono: "11 3261-0881",
  coordenadas: [
    [-34.81592776541516, -58.48748064479853]
  ]
},

{
  id: "gomeria-7",
  nombre: "Gomería Cristobal Colon",
  descripcion: "Horario declarado de 8:00 a 21:00",
  tipo: "gomeria",
  servicios: ["parche", "cámaras", "cubiertas"],
  horario: "Lun a Dom: 8:00 - 21:00",
  telefono: "No disponible",
  coordenadas: [
    [-34.83050761002335, -58.46746842271803]
  ]
},
{
  id: "gomeria-8",
  nombre: "Gomería El Gringo",
  descripcion: "Servicio de parche y reparacion de neumaticos",
  tipo: "gomeria",
  servicios: ["parche", "cámaras", "cubiertas"],
  horario: "No disponible",
  telefono: "11 2755-0460",
  coordenadas: [
    [-34.831393077869215, -58.47629753129641]
  ]
}

  ]; 
  res.json({ success: true, zonas });
});


module.exports = router;
