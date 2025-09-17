// Script de migración para agregar la columna role
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'users.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error abriendo la base de datos:', err.message);
    return;
  }
  
  console.log('Conectado a la base de datos SQLite');
  
  // Agregar columna role si no existe
  db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'", function(err) {
    if (err) {
      console.log('La columna role ya existe o error:', err.message);
    } else {
      console.log('Columna role agregada exitosamente');
    }
    
    // Hacer administrador al primer usuario
    db.run("UPDATE users SET role = 'admin' WHERE id = 1", function(err) {
      if (err) {
        console.error('Error actualizando usuario:', err.message);
      } else {
        console.log('Usuario con ID 1 promovido a administrador');
      }
      
      // Verificar usuarios
      db.all("SELECT id, nombre, email, role FROM users", (err, rows) => {
        if (err) {
          console.error('Error consultando usuarios:', err.message);
        } else {
          console.log('Usuarios en la base de datos:');
          console.log(JSON.stringify(rows, null, 2));
        }
        
        // Cerrar conexión
        db.close((err) => {
          if (err) {
            console.error('Error cerrando la base de datos:', err.message);
          } else {
            console.log('Conexión cerrada');
          }
        });
      });
    });
  });
});
