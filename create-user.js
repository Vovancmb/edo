import readline from 'readline';
import db from './db.js';
import { hashPassword } from './crypto.js';

const args = process.argv.slice(2);
let username, fullName, password, wantAdmin = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--username' || a === '-u') username = args[++i];
  else if (a === '--name' || a === '-n') fullName = args[++i];
  else if (a === '--password' || a === '-p') password = args[++i];
  else if (a === '--admin' || a === '-a') wantAdmin = true;
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, r));

(async () => {
  if (!username) username = (await ask('Логин: ')).trim();
  if (!fullName) fullName = (await ask('ФИО: ')).trim();
  if (!password) password = (await ask('Пароль: ')).trim();
  rl.close();

  if (!username || !password) { console.error('✗ Логин и пароль обязательны'); process.exit(1); }
  if (password.length < 6)   { console.error('✗ Пароль минимум 6 символов'); process.exit(1); }

  const totalCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const isAdmin = totalCount === 0 || wantAdmin;

  try {
    db.prepare('INSERT INTO users (username, password_hash, full_name, is_admin) VALUES (?, ?, ?, ?)')
      .run(username, hashPassword(password), fullName || username, isAdmin ? 1 : 0);
    console.log(`✓ Пользователь «${username}» создан (${fullName || username})${isAdmin ? ' [АДМИН]' : ''}`);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) console.error('✗ Такой логин уже существует');
    else console.error('✗ Ошибка:', e.message);
    process.exit(1);
  }
})();
