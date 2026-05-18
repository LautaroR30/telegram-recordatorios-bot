const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();

const TOKEN = "8848436761:AAEP0MflVz_NatESHAP0mFa4rP2DkDmnd6M";

const bot = new TelegramBot(TOKEN, { polling: true });

const db = new sqlite3.Database("./tareas.db");

db.run(`
CREATE TABLE IF NOT EXISTS tareas (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 chat_id INTEGER,
 id_usuario INTEGER,
 mensaje TEXT,
 fecha_hora INTEGER,
 estado TEXT DEFAULT 'pendiente'
)
`);

// objeto de recordatorios
const reprogramaciones = {};

// Crear ID por usuario
function obtenerSiguienteId(chatId, callback) {

 db.get(
  "SELECT MAX(id_usuario) as max FROM tareas WHERE chat_id = ?",
  [chatId],
  (err,row)=>{
   let next = 1;
   if(row && row.max) next = row.max + 1;
   callback(next);
  }
 );

}

// Función recordar
bot.on("message",(msg)=>{

 const chatId = msg.chat.id;
 const texto = msg.text;

 // detectar si está reprogramando
 if(reprogramaciones[chatId]){

  const id = reprogramaciones[chatId];

  const partes = texto.split(" ");

  if(partes.length < 2){
   bot.sendMessage(chatId,"❌ Formato inválido. Ej: mañana 18:00");
   return;
  }

  const fecha = partes[0];
  const hora = partes[1];

  const fechaHora = parseFecha(fecha,hora);

  if(!fechaHora){
   bot.sendMessage(chatId,"❌ Fecha u hora inválida");
   return;
  }

  db.run(
   "UPDATE tareas SET fecha_hora=?, estado='pendiente' WHERE id=?",
   [fechaHora,id]
  );

  delete reprogramaciones[chatId];

  bot.sendMessage(chatId,"🔁 Recordatorio reprogramado");

  return;
 }

 // lógica normal de "recordar"

 if(!texto.startsWith("recordar")) return;

 const partes = texto.split(" ");

 if(partes.length < 4){
  bot.sendMessage(chatId,"❌ Formato incorrecto");
  return;
 }

 const fecha = partes[1];
 const hora = partes[2];
 const mensaje = partes.slice(3).join(" ");

 const fechaHora = parseFecha(fecha,hora);

 if(!fechaHora){
  bot.sendMessage(chatId,"❌ Fecha inválida");
  return;
 }

 obtenerSiguienteId(chatId,(idUsuario)=>{

  db.run(
   "INSERT INTO tareas (chat_id,id_usuario,mensaje,fecha_hora) VALUES (?,?,?,?)",
   [chatId,idUsuario,mensaje,fechaHora],
  );

  bot.sendMessage(chatId,
`✅ Recordatorio guardado

ID: ${idUsuario}
📝 ${mensaje}`
  );

 });

});

// Interpretar fechas
function parseFecha(fechaStr,horaStr){

 const ahora = new Date();

 let fecha = new Date();

 if(fechaStr === "hoy"){
  fecha = new Date();
 }
 else if(fechaStr === "mañana"){
  fecha = new Date();
  fecha.setDate(fecha.getDate()+1);
 }
 else{
  return null;
 }

     const partesHora = horaStr.split(":");

     if(partesHora.length !== 2) return null;

     const horas = parseInt(partesHora[0]);
     const minutos = parseInt(partesHora[1]);

     if(isNaN(horas) || isNaN(minutos)) return null;

     fecha.setHours(horas);
     fecha.setMinutes(minutos);
     fecha.setSeconds(0);

 if(fecha <= ahora) return null;

 return fecha.getTime();

}

// Listar pendientes
bot.onText(/pendientes/, (msg)=>{

 const chatId = msg.chat.id;

 db.all(
  "SELECT * FROM tareas WHERE chat_id=? AND estado='pendiente' ORDER BY fecha_hora",
  [chatId],
  (err,rows)=>{

   if(rows.length===0){
    bot.sendMessage(chatId,"📭 No tenés recordatorios.");
    return;
   }

   rows.forEach(t=>{

    const fecha = new Date(t.fecha_hora);

    bot.sendMessage(
     chatId,
`📌 ID: ${t.id_usuario}
📝 ${t.mensaje}
⏰ ${fecha.toLocaleString()}`,
     {
      reply_markup:{
       inline_keyboard:[
        [
         {text:"✔ Hecho",callback_data:`done_${t.id}`},
         {text:"🔁 Reprogramar",callback_data:`rep_${t.id}`}
        ],
        [
         {text:"❌ Eliminar",callback_data:`del_${t.id}`}
        ]
       ]
      }
     }
    );

   });

  }
 );

});

// Revisar recordatorios
setInterval(()=>{

 const ahora = Date.now();

 db.all(
  "SELECT * FROM tareas WHERE estado='pendiente' AND fecha_hora <= ?",
  [ahora],
  (err,rows)=>{

   rows.forEach(t=>{

    bot.sendMessage(
     t.chat_id,
`⏰ Recordatorio

ID: ${t.id_usuario}
📝 ${t.mensaje}`,
     {
      reply_markup:{
       inline_keyboard:[
        [
         {text:"✔ Hecho",callback_data:`done_${t.id}`},
         {text:"🔁 Reprogramar",callback_data:`rep_${t.id}`}
        ],
        [
         {text:"❌ Eliminar",callback_data:`del_${t.id}`}
        ]
       ]
      }
     }
    );

    db.run(
     "UPDATE tareas SET estado='enviado' WHERE id=?",
     [t.id]
    );

   });

  }
 );

},60000);

// detectar botón apretado
bot.on("callback_query",(query)=>{

 const data = query.data;
 const chatId = query.message.chat.id;

 if(data.startsWith("done_")){

  const id = data.split("_")[1];

  db.run("UPDATE tareas SET estado='hecho' WHERE id=?", [id]);

  bot.sendMessage(chatId,"✅ Tarea marcada como hecha");

 }

 if(data.startsWith("del_")){

  const id = data.split("_")[1];

  db.run("DELETE FROM tareas WHERE id=?", [id]);

  bot.sendMessage(chatId,"🗑 Recordatorio eliminado");

 }

 if(data.startsWith("rep_")){
 
 const id = data.split("_")[1];
 
 reprogramaciones[chatId] = id;
 
 bot.sendMessage(chatId,"📅 Escribí la nueva fecha y hora\nEj: mañana 18:00");

 }

});