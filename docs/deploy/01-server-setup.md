# Этап 1. Настройка VPS с нуля (Ubuntu 26.04 LTS → безопасность → Docker → Nginx 1.27 → SSL)

**Сервер:** vps.sweb.ru, IP `77.222.38.191`
**Домен:** `crmdetroid.ru` (+ `www.crmdetroid.ru`)
**Что получится в конце этапа:** заходить на сервер можно только по SSH-ключу под обычным
пользователем, работает файрвол и защита от перебора паролей, установлен Docker,
в контейнере крутится Nginx 1.27, а по адресу **https://crmdetroid.ru** открывается
страница-заглушка с валидным «зелёным» сертификатом, который продлевается сам.

---

## Как читать инструкцию

Перед каждым блоком команд написано, **где** его выполнять:

| Метка | Где выполнять |
|---|---|
| 🖥 **ЛОКАЛЬНО** | В терминале твоего компьютера (не на сервере) |
| 🌐 **СЕРВЕР (root)** | На сервере, под пользователем `root` |
| 🌐 **СЕРВЕР (deploy)** | На сервере, под новым пользователем `deploy` |

Команды можно копировать целиком блоком — они написаны так, чтобы работать одна за другой.
Блоки вида `cat > файл <<'EOF' … EOF` создают файл: копируй **вместе со строкой `EOF`** в конце.

> ⚠️ **Золотое правило этапа:** пока мы меняем настройки SSH — **не закрывай окно терминала,
> в котором ты уже вошёл на сервер**. Проверять новый способ входа нужно во ВТОРОМ окне.
> Если что-то пойдёт не так, старое окно спасёт: через него можно откатить настройки.

---

## Шаг 0. Что нужно под рукой

1. IP сервера: `77.222.38.191`.
2. Пароль `root`, который прислал sweb.ru после переустановки (или который ты задал в панели).
3. Доступ в панель sweb.ru — там есть **VNC-консоль** (аварийный вход, если сломается SSH).
4. Уверенность, что DNS домена уже смотрит на сервер (проверим на шаге 10).

---

## Шаг 1. Первый вход и базовая подготовка системы

### 1.1. Входим на сервер

🖥 **ЛОКАЛЬНО** (Windows — PowerShell, macOS/Linux — Терминал):

```bash
ssh root@77.222.38.191
```

Первый раз спросит `Are you sure you want to continue connecting (yes/no)?` → пиши `yes`,
затем введи пароль root (при вводе пароля символы не отображаются — это нормально).

> Если пишет `REMOTE HOST IDENTIFICATION HAS CHANGED` — это потому, что сервер переустановлен,
> а твой компьютер помнит старый «отпечаток». Лечится 🖥 **ЛОКАЛЬНО**:
> `ssh-keygen -R 77.222.38.191` (на Windows команда та же), потом заходи заново.

### 1.2. Обновляем систему

🌐 **СЕРВЕР (root)**:

```bash
apt update && apt -y upgrade
```

*Что делает:* `apt update` — скачивает свежий список пакетов, `apt upgrade` — обновляет
установленные пакеты до последних версий с исправлениями безопасности.
Если увидишь синее окно «Which services should be restarted?» — жми `Tab` → `Ok` → `Enter`.

### 1.3. Ставим базовые утилиты

🌐 **СЕРВЕР (root)**:

```bash
apt -y install curl wget git nano ufw fail2ban ca-certificates gnupg htop dnsutils unattended-upgrades python3-systemd
```

*Что это:* `curl/wget` — скачивание, `git` — работа с кодом, `nano` — простой редактор
(выход: `Ctrl+O`, `Enter`, `Ctrl+X`), `ufw` — файрвол, `fail2ban` — блокировка
подбирающих пароль, `dnsutils` — проверка DNS, `unattended-upgrades` — автообновления
безопасности, `python3-systemd` — нужен fail2ban, чтобы читать системный журнал.

### 1.4. Имя сервера и часовой пояс

🌐 **СЕРВЕР (root)**:

```bash
hostnamectl set-hostname crm
timedatectl set-timezone Europe/Moscow
timedatectl                      # проверка: должно быть Time zone: Europe/Moscow
```

*Зачем:* в логах будет понятное имя сервера и московское время — это сильно упрощает
разбор проблем.

### 1.5. Swap-файл (если оперативной памяти 2 ГБ или меньше)

Сначала посмотрим, сколько памяти и есть ли swap:

🌐 **СЕРВЕР (root)**:

```bash
free -h
```

Если в строке `Swap:` стоят нули, а памяти немного — создаём файл подкачки на 2 ГБ.
Это страховка: при сборке фронтенда и работе PostgreSQL память может закончиться,
и без swap система просто «убьёт» процесс.

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
sysctl -p /etc/sysctl.d/99-swappiness.conf
free -h                          # проверка: в строке Swap появились 2.0Gi
```

---

## Шаг 2. Создаём SSH-ключ на своём компьютере

**Простыми словами:** SSH-ключ — это пара файлов. Приватный (`id_ed25519`) остаётся у тебя
на компьютере и никому не показывается. Публичный (`id_ed25519.pub`) кладётся на сервер.
Сервер пускает только того, у кого есть приватная половина. Это надёжнее любого пароля,
потому что подобрать ключ перебором невозможно.

🖥 **ЛОКАЛЬНО** (одинаково для Windows PowerShell, macOS и Linux):

```bash
ssh-keygen -t ed25519 -C "crmdetroid" -f ~/.ssh/id_ed25519_crm
```

- На вопрос `Enter passphrase` можно нажать `Enter` дважды (без пароля на ключ) —
  проще в работе. Если введёшь пароль-фразу, её будут спрашивать при каждом подключении
  (надёжнее; на macOS/Linux её можно закэшировать через `ssh-agent`).

Показать публичную часть ключа (пригодится дальше):

🖥 **ЛОКАЛЬНО** macOS/Linux:

```bash
cat ~/.ssh/id_ed25519_crm.pub
```

🖥 **ЛОКАЛЬНО** Windows PowerShell:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519_crm.pub
```

Должна вывестись одна длинная строка, начинающаяся на `ssh-ed25519 AAAA...` и
заканчивающаяся на `crmdetroid`. **Скопируй её целиком** — вставим на сервер на шаге 3.

---

## Шаг 3. Создаём пользователя `deploy` и кладём ему ключ

**Зачем:** работать под `root` опасно — любая ошибка или взлом сразу дают полный контроль.
Заведём обычного пользователя с правом повышать привилегии через `sudo`.

### 3.1. Создаём пользователя

🌐 **СЕРВЕР (root)**:

```bash
adduser --gecos "" deploy
```

Команда спросит пароль — **придумай надёжный и запиши его**: он понадобится для `sudo`.

Даём права администратора:

```bash
usermod -aG sudo deploy
```

### 3.2. Кладём публичный ключ пользователю `deploy`

🌐 **СЕРВЕР (root)** — выполняй построчно, во второй строке **вместо `ВСТАВЬ_СЮДА_КЛЮЧ`
вставь строку, скопированную на шаге 2**:

```bash
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
echo 'ВСТАВЬ_СЮДА_КЛЮЧ' > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
cat /home/deploy/.ssh/authorized_keys      # проверка: видна твоя строка ssh-ed25519 ...
```

*Что делает:* создаёт папку `.ssh` с правильными правами (SSH очень строг к правам доступа:
если они слишком широкие — вход по ключу молча не сработает) и записывает туда твой ключ.

### 3.3. ПРОВЕРКА (самый важный момент этапа)

**Не закрывая текущее окно с root**, открой **ВТОРОЕ** окно терминала.

🖥 **ЛОКАЛЬНО** (второе окно):

```bash
ssh -i ~/.ssh/id_ed25519_crm deploy@77.222.38.191
```

Windows PowerShell:

```powershell
ssh -i $env:USERPROFILE\.ssh\id_ed25519_crm deploy@77.222.38.191
```

Должен зайти **без запроса пароля**. Проверь, что `sudo` работает (спросит пароль `deploy`):

🌐 **СЕРВЕР (deploy)**:

```bash
sudo whoami        # должно ответить: root
```

✅ Если зашёл по ключу и `sudo` ответил `root` — идём дальше.
❌ Если нет — не трогай настройки SSH, вернись к шагу 3.2 и проверь содержимое
`authorized_keys` (ключ должен быть **одной строкой**, без переносов).

### 3.4. Удобный ярлык для подключения (по желанию, но очень удобно)

🖥 **ЛОКАЛЬНО** macOS/Linux:

```bash
cat >> ~/.ssh/config <<'EOF'

Host crm
    HostName 77.222.38.191
    User deploy
    IdentityFile ~/.ssh/id_ed25519_crm
    ServerAliveInterval 60
EOF
chmod 600 ~/.ssh/config
```

На Windows файл тот же: `C:\Users\<имя>\.ssh\config` (создай, если нет, тем же содержимым,
но путь к ключу — `C:\Users\<имя>\.ssh\id_ed25519_crm`).

Теперь подключение — просто:

```bash
ssh crm
```

---

## Шаг 4. Закрываем SSH: только ключи, без root

**Зачем:** пока сервер пускает по паролю, боты будут круглосуточно перебирать пароли
(это начинается буквально через минуты после включения сервера). Отключим пароли и вход под root.

### 4.1. Смотрим, нет ли чужих настроек

🌐 **СЕРВЕР (deploy)**:

```bash
ls -l /etc/ssh/sshd_config.d/
```

Часто там лежит файл `50-cloud-init.conf`, который включает вход по паролю.
Важная особенность SSH: **побеждает первое встреченное значение**, а файлы читаются
по алфавиту. Поэтому наш файл назовём `00-crm-hardening.conf` — он будет прочитан первым
и переопределит остальные.

### 4.2. Создаём файл с жёсткими настройками

🌐 **СЕРВЕР (deploy)**:

```bash
sudo tee /etc/ssh/sshd_config.d/00-crm-hardening.conf > /dev/null <<'EOF'
# --- CRM hardening ---
PermitRootLogin no                 # вход под root запрещён полностью
PasswordAuthentication no          # вход по паролю запрещён — только ключи
KbdInteractiveAuthentication no    # и по "интерактивному" паролю тоже
PubkeyAuthentication yes           # вход по ключу разрешён
AuthenticationMethods publickey
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 3                     # максимум 3 попытки за подключение
LoginGraceTime 30                  # 30 секунд на вход, потом разрыв
ClientAliveInterval 300            # пинг клиента раз в 5 минут
ClientAliveCountMax 2
AllowUsers deploy                  # заходить может только пользователь deploy
EOF
```

### 4.3. Проверяем синтаксис и применяем

🌐 **СЕРВЕР (deploy)**:

```bash
sudo /usr/sbin/sshd -t && echo "конфиг валиден"
```

Если написало «конфиг валиден» — применяем:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ssh.socket 2>/dev/null || true
sudo systemctl restart ssh
sudo systemctl status ssh --no-pager | head -5
```

*Почему две строки про restart:* в свежих Ubuntu SSH может запускаться «по требованию»
через `ssh.socket`. Команды выше корректно перезапускают оба варианта.

### 4.4. ПРОВЕРКА

Открой **третье** окно терминала и попробуй:

🖥 **ЛОКАЛЬНО**:

```bash
ssh crm                                   # должно пустить по ключу
ssh root@77.222.38.191                    # должно ОТКАЗАТЬ (Permission denied)
```

✅ Первое работает, второе отказывает — отлично. Теперь окно с `root` можно закрыть,
дальше всё делаем под `deploy` через `sudo`.

### 4.5. (По желанию, для продвинутых) Смена порта SSH с 22 на 2222

Это не повышает безопасность принципиально, но убирает 95 % мусора в логах.
**Если не уверен — пропусти этот пункт.**

🌐 **СЕРВЕР (deploy)**:

```bash
sudo ufw allow 2222/tcp                                  # СНАЧАЛА открыть порт!
echo "Port 2222" | sudo tee -a /etc/ssh/sshd_config.d/00-crm-hardening.conf
sudo systemctl is-enabled ssh.socket 2>/dev/null && echo "нужен блок ниже" || echo "блок ниже НЕ нужен"
```

Если написало «нужен блок ниже» (SSH запускается через сокет), порт задаётся так:

```bash
sudo mkdir -p /etc/systemd/system/ssh.socket.d
sudo tee /etc/systemd/system/ssh.socket.d/port.conf > /dev/null <<'EOF'
[Socket]
ListenStream=
ListenStream=2222
EOF
sudo systemctl daemon-reload
sudo systemctl restart ssh.socket
```

Проверь **из второго окна**: `ssh -p 2222 deploy@77.222.38.191`. Работает — можно закрыть
старый порт: `sudo ufw delete allow OpenSSH`. И добавь `Port 2222` в свой `~/.ssh/config`.

---

## Шаг 5. Файрвол UFW

**Простыми словами:** файрвол — это список «кого пускаем». Закроем всё входящее, кроме
SSH (иначе сами себя отрежем), HTTP (80) и HTTPS (443).

🌐 **СЕРВЕР (deploy)**:

```bash
sudo ufw default deny incoming      # всё входящее — запрещено
sudo ufw default allow outgoing     # исходящее — разрешено (сервер может качать обновления)
sudo ufw allow OpenSSH              # 22/tcp (если менял порт — пропусти, ты уже открыл 2222)
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw enable                     # спросит подтверждение -> введи y
sudo ufw status verbose
```

Ожидаемый вывод — примерно такой:

```
Status: active
To                         Action      From
--                         ------      ----
22/tcp (OpenSSH)           ALLOW IN    Anywhere
80/tcp                     ALLOW IN    Anywhere
443/tcp                    ALLOW IN    Anywhere
```

> ⚠️ **Важно знать про Docker и UFW.** Docker пишет свои правила в обход UFW. Это значит:
> если в `docker-compose.yml` указать `ports: ["5432:5432"]`, база данных станет доступна
> **всему интернету**, даже при включённом файрволе. Правило на будущее:
> **наружу (`0.0.0.0`) публикуем только 80 и 443 у nginx**, а всё внутреннее — либо вообще
> без `ports:` (контейнеры видят друг друга по именам внутри сети Docker), либо строго
> с адресом `127.0.0.1`, например `ports: ["127.0.0.1:5432:5432"]`.
> В нашем `docker-compose.yml` это соблюдено.

---

## Шаг 6. fail2ban — автобан подбирающих пароль

**Простыми словами:** fail2ban читает журнал и, если с одного IP идут неудачные попытки
входа, временно блокирует этот IP файрволом.

🌐 **СЕРВЕР (deploy)**:

```bash
sudo tee /etc/fail2ban/jail.local > /dev/null <<'EOF'
[DEFAULT]
backend  = systemd        # читать системный журнал (в Ubuntu 26.04 логи там)
banaction = ufw           # блокировать через UFW, который мы уже настроили
banaction_allports = ufw
bantime  = 1h             # срок бана
findtime = 10m            # окно наблюдения
maxretry = 5              # сколько промахов допускаем
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled  = true
maxretry = 4
bantime  = 24h
EOF

sudo systemctl enable --now fail2ban
sudo systemctl restart fail2ban
sleep 3
sudo fail2ban-client status sshd
```

Ожидаемый вывод — статус тюрьмы `sshd` со списком счётчиков (Currently banned: 0 и т. д.).

Полезные команды на будущее:

```bash
sudo fail2ban-client status sshd                 # кто забанен
sudo fail2ban-client set sshd unbanip 1.2.3.4    # разбанить IP (вдруг это ты)
```

> 💡 Если боишься забанить сам себя — добавь свой домашний IP в `ignoreip` (узнать его
> можно на сайте `ifconfig.me`). Но помни: домашний IP обычно меняется.

---

## Шаг 7. Автоматические обновления безопасности

🌐 **СЕРВЕР (deploy)**:

```bash
sudo tee /etc/apt/apt.conf.d/20auto-upgrades > /dev/null <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

sudo systemctl enable --now unattended-upgrades
sudo unattended-upgrades --dry-run --debug 2>&1 | tail -5
```

*Что делает:* раз в сутки сервер сам скачивает и ставит **только обновления безопасности**.
Обычные пакеты не трогаются, так что ничего неожиданно не сломается.

---

## Шаг 8. Docker + Docker Compose

**Простыми словами:** Docker — это способ запускать программы в изолированных «коробках»
(контейнерах) со всеми их зависимостями. Docker Compose — файл-описание, какие коробки
запустить и как их связать. Благодаря этому весь стек (Postgres, Valkey, FastAPI, Nginx)
поднимается одной командой и одинаково работает на любом сервере.

### 8.1. Подключаем официальный репозиторий Docker

🌐 **СЕРВЕР (deploy)**:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
```

*Что делает:* добавляет GPG-ключ (подпись, подтверждающая подлинность пакетов) и адрес
репозитория Docker для нашей версии Ubuntu (`resolute` = 26.04).

> Если `apt update` ругается, что репозитория для `resolute` нет, временно используй
> ветку предыдущей LTS — пакеты полностью совместимы:
> ```bash
> echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
> sudo apt update
> ```

### 8.2. Ставим Docker

```bash
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
docker --version
docker compose version
```

Ожидаем что-то вроде `Docker version 29.x.x` и `Docker Compose version v2.x.x`.

### 8.3. Ограничиваем размер логов Docker

Без этого логи контейнеров со временем могут забить весь диск.

```bash
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true
}
EOF

sudo systemctl restart docker
```

*`live-restore`* — контейнеры продолжают работать, даже когда сам Docker перезапускается.

### 8.4. Разрешаем `deploy` работать с Docker без sudo

```bash
sudo usermod -aG docker deploy
```

Чтобы изменение вступило в силу — **выйди и зайди заново**:

```bash
exit
```

🖥 **ЛОКАЛЬНО**: `ssh crm`

🌐 **СЕРВЕР (deploy)** — проверка:

```bash
docker run --rm hello-world
```

Должно вывести «Hello from Docker!» и завершиться.

> ⚠️ Членство в группе `docker` фактически равно правам root. Поэтому в эту группу
> добавляем только `deploy` и никого больше.

---

## Шаг 9. Структура каталогов проекта

🌐 **СЕРВЕР (deploy)**:

```bash
sudo mkdir -p /opt/crm
sudo chown -R deploy:deploy /opt/crm
mkdir -p /opt/crm/{nginx/conf.d,nginx/snippets,www,certbot/www}
cd /opt/crm
ls -R
```

Что где лежит:

```
/opt/crm
├── docker-compose.yml     # описание контейнеров
├── nginx/
│   ├── conf.d/            # конфиги сайтов
│   └── snippets/          # переиспользуемые куски (TLS, заголовки)
├── www/                   # статика (сейчас заглушка, позже — сборка фронтенда)
└── certbot/www/           # временные файлы проверки домена для Let's Encrypt
```

---

## Шаг 10. Поднимаем Nginx 1.27 в Docker (пока по HTTP)

> **Почему nginx в контейнере, а не `apt install nginx`?**
> Во-первых, в стеке зафиксирована версия **1.27**, а в репозитории Ubuntu 26.04 лежит
> другая — контейнер `nginx:1.27-alpine` даёт ровно ту версию, что нужно, и одинаковую
> и на сервере, и локально. Во-вторых, весь остальной стек тоже в Docker Compose:
> nginx будет обращаться к бэкенду просто по имени `backend`, без возни с портами и IP.
> Сертификаты при этом хранятся на хосте (`/etc/letsencrypt`) и монтируются в контейнер
> только на чтение — так их проще продлевать.

### 10.1. Сначала проверяем DNS

🌐 **СЕРВЕР (deploy)**:

```bash
dig +short crmdetroid.ru
dig +short www.crmdetroid.ru
```

**Обе команды должны вывести `77.222.38.191`.**
Если вывод пустой или другой IP — сертификат выпустить не получится. Зайди в панель
управления DNS и убедись, что есть две A-записи:

| Тип | Имя | Значение |
|---|---|---|
| A | `@` (или `crmdetroid.ru`) | `77.222.38.191` |
| A | `www` | `77.222.38.191` |

После правки DNS обновление может занять от нескольких минут до пары часов.

### 10.2. Проверяем, что порты 80/443 свободны

```bash
sudo ss -tulpn | grep -E ':80|:443' || echo "порты свободны"
```

Если что-то занимает порт (например, предустановленный apache2/nginx) — убираем:

```bash
sudo systemctl disable --now nginx apache2 2>/dev/null; sudo apt -y purge nginx apache2 2>/dev/null
```

### 10.3. Создаём файлы конфигурации

🌐 **СЕРВЕР (deploy)** — общие настройки nginx:

```bash
cat > /opt/crm/nginx/conf.d/00-common.conf <<'EOF'
server_tokens off;
client_max_body_size 25m;
client_body_timeout 30s;

proxy_connect_timeout 10s;
proxy_send_timeout    60s;
proxy_read_timeout    60s;

gzip on;
gzip_vary on;
gzip_comp_level 5;
gzip_min_length 1024;
gzip_proxied any;
gzip_types text/plain text/css text/javascript application/javascript application/json
           application/xml image/svg+xml font/woff font/woff2;
EOF
```

Временный конфиг сайта (только HTTP — сертификата ведь ещё нет):

```bash
cat > /opt/crm/nginx/conf.d/crmdetroid.ru.conf <<'EOF'
server {
    listen 80;
    server_name crmdetroid.ru www.crmdetroid.ru;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
    }

    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 "ok\n";
    }

    location / {
        root /var/www/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}
EOF
```

Страница-заглушка:

```bash
cat > /opt/crm/www/index.html <<'EOF'
<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<title>CRM Detroid</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f19;
color:#e6ebf5;font-family:Inter,system-ui,sans-serif}div{text-align:center}
h1{letter-spacing:-.02em}p{color:#8b98b0}</style></head>
<body><div><h1>crmdetroid.ru</h1><p>Сервер настроен. Приложение скоро будет здесь.</p></div></body></html>
EOF
```

### 10.4. Создаём `docker-compose.yml`

```bash
cat > /opt/crm/docker-compose.yml <<'EOF'
name: crm

services:
  nginx:
    image: nginx:1.27-alpine
    container_name: crm-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./nginx/snippets:/etc/nginx/snippets:ro
      - ./www:/var/www/html:ro
      - ./certbot/www:/var/www/certbot:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "-", "http://127.0.0.1/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    networks:
      - edge

networks:
  edge:
    name: crm_edge
EOF
```

Так как каталог `/etc/letsencrypt` ещё не существует, создадим его заранее (иначе Docker
создаст его сам, но с неудобными правами):

```bash
sudo mkdir -p /etc/letsencrypt
```

### 10.5. Запускаем

```bash
cd /opt/crm
docker compose up -d
docker compose ps
```

В колонке `STATUS` должно быть `Up ... (healthy)` (статус healthy появится через ~10 секунд).

### 10.6. ПРОВЕРКА

С самого сервера:

```bash
curl -I http://127.0.0.1/healthz          # ожидаем HTTP/1.1 200 OK
```

🖥 **ЛОКАЛЬНО** (то есть «снаружи», как это видит интернет):

```bash
curl -I http://crmdetroid.ru
```

И просто открой в браузере **http://crmdetroid.ru** — должна показаться тёмная страница-заглушка.

✅ Видишь заглушку по домену — можно выпускать сертификат.
❌ Не открывается — смотри «Приложение A. Частые проблемы».

---

## Шаг 11. SSL-сертификат Let's Encrypt (Certbot)

**Простыми словами:** Let's Encrypt бесплатно выдаёт сертификаты, но сначала должен
убедиться, что домен твой. Способ проверки (`http-01`): Certbot кладёт файл в
`/opt/crm/certbot/www/.well-known/acme-challenge/`, а сервер Let's Encrypt пытается
скачать его по `http://crmdetroid.ru/...`. Наш nginx уже умеет отдавать эту папку.

### 11.1. Ставим Certbot

🌐 **СЕРВЕР (deploy)**:

```bash
sudo apt -y install certbot
certbot --version
```

> Плагин `python3-certbot-nginx` нам **не нужен**: nginx живёт в контейнере, а мы
> используем режим `--webroot`, который просто кладёт файл в папку.

### 11.2. Репетиция (обязательно!)

У Let's Encrypt есть лимиты на количество попыток, поэтому сначала — тестовый прогон.
**Замени `ТВОЙ@EMAIL.RU` на свою реальную почту** (туда придут письма, если сертификат
вдруг перестанет продлеваться):

```bash
sudo certbot certonly --webroot \
  -w /opt/crm/certbot/www \
  -d crmdetroid.ru -d www.crmdetroid.ru \
  --email ТВОЙ@EMAIL.RU \
  --agree-tos --no-eff-email \
  --dry-run
```

Ожидаемый ответ: `The dry run was successful.`
Если ошибка — исправляем её сейчас (см. Приложение A), лимиты при dry-run не тратятся.

### 11.3. Выпускаем настоящий сертификат

```bash
sudo certbot certonly --webroot \
  -w /opt/crm/certbot/www \
  -d crmdetroid.ru -d www.crmdetroid.ru \
  --email ТВОЙ@EMAIL.RU \
  --agree-tos --no-eff-email
```

Успех выглядит так: `Successfully received certificate.` и путь
`/etc/letsencrypt/live/crmdetroid.ru/fullchain.pem`.

Проверим:

```bash
sudo ls -l /etc/letsencrypt/live/crmdetroid.ru/
sudo certbot certificates
```

---

## Шаг 12. Переключаем nginx на HTTPS

### 12.1. Файлы с настройками TLS

🌐 **СЕРВЕР (deploy)**:

```bash
cat > /opt/crm/nginx/snippets/ssl.conf <<'EOF'
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;

ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;

# OCSP stapling НЕ включаем: с 2025 года Let's Encrypt не кладёт OCSP-адрес
# в сертификаты (перешли на CRL) — nginx на это ругался предупреждением.

cat > /opt/crm/nginx/snippets/security-headers.conf <<'EOF'
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
EOF
```

### 12.2. Боевой конфиг сайта

```bash
cat > /opt/crm/nginx/conf.d/crmdetroid.ru.conf <<'EOF'
# --- HTTP: ACME + редирект на HTTPS ---
server {
    listen 80;
    server_name crmdetroid.ru www.crmdetroid.ru;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
    }

    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 "ok\n";
    }

    location / {
        return 301 https://crmdetroid.ru$request_uri;
    }
}

# --- HTTPS www -> без www ---
server {
    listen 443 ssl;
    http2 on;
    server_name www.crmdetroid.ru;

    ssl_certificate     /etc/letsencrypt/live/crmdetroid.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crmdetroid.ru/privkey.pem;
    include /etc/nginx/snippets/ssl.conf;

    return 301 https://crmdetroid.ru$request_uri;
}

# --- HTTPS основной сайт ---
server {
    listen 443 ssl;
    http2 on;
    server_name crmdetroid.ru;

    ssl_certificate     /etc/letsencrypt/live/crmdetroid.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crmdetroid.ru/privkey.pem;
    include /etc/nginx/snippets/ssl.conf;
    include /etc/nginx/snippets/security-headers.conf;

    root /var/www/html;
    index index.html;

    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 "ok\n";
    }

    # === ЭТАП 4: включим, когда появятся контейнеры backend и frontend ===
    # location /api/ {
    #     proxy_pass http://backend:8000;
    #     proxy_http_version 1.1;
    #     proxy_set_header Host              $host;
    #     proxy_set_header X-Real-IP         $remote_addr;
    #     proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    #     proxy_set_header X-Forwarded-Proto $scheme;
    # }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
```

### 12.3. Проверяем конфиг и применяем без простоя

```bash
cd /opt/crm
docker compose exec nginx nginx -t          # проверка синтаксиса ВНУТРИ контейнера
```

Ожидаем `syntax is ok` и `test is successful`. Только после этого:

```bash
docker compose exec nginx nginx -s reload   # мягкая перезагрузка, сайт не падает
```

> Если `nginx -t` ругается — сайт продолжает работать на старом конфиге. Спокойно
> исправляй файл и повторяй проверку.

### 12.4. ПРОВЕРКА

🌐 **СЕРВЕР (deploy)**:

```bash
curl -I https://crmdetroid.ru                 # ожидаем HTTP/2 200
curl -I http://crmdetroid.ru                  # ожидаем 301 -> https://crmdetroid.ru/
curl -I https://www.crmdetroid.ru             # ожидаем 301 -> https://crmdetroid.ru/
```

В браузере открой **https://crmdetroid.ru** → слева от адреса должен быть замок без
предупреждений. Дополнительно можно прогнать тест на
`https://www.ssllabs.com/ssltest/analyze.html?d=crmdetroid.ru` — ожидаемая оценка **A**.

---

## Шаг 13. Автопродление сертификата

Сертификаты Let's Encrypt живут 90 дней. Пакет `certbot` уже ставит системный таймер,
который дважды в сутки проверяет, не пора ли продлевать. Нам нужно добавить одно:
после обновления сертификата **сказать nginx перечитать файлы**.

### 13.1. Хук перезагрузки nginx

🌐 **СЕРВЕР (deploy)**:

```bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy

sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh > /dev/null <<'EOF'
#!/bin/sh
set -eu
CONTAINER="crm-nginx"
if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    docker kill --signal=HUP "$CONTAINER" >/dev/null 2>&1 \
        && echo "[certbot-hook] nginx перечитал сертификаты" \
        || docker restart "$CONTAINER" >/dev/null 2>&1
else
    echo "[certbot-hook] контейнер $CONTAINER не запущен — пропускаю reload"
fi
EOF

sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

*Что делает:* скрипт лежит в папке `renewal-hooks/deploy` — Certbot запускает всё оттуда
**только когда сертификат действительно обновился**. Сигнал `HUP` заставляет nginx
подхватить новый сертификат без остановки сайта.

### 13.2. Проверяем, что таймер работает

```bash
systemctl list-timers certbot.timer --no-pager
sudo systemctl status certbot.timer --no-pager | head -5
```

Если таймера нет (`Unit certbot.timer could not be found`) — включим:

```bash
sudo systemctl enable --now certbot.timer
```

### 13.3. Репетиция продления

```bash
sudo certbot renew --dry-run
```

Ожидаем в конце: `Congratulations, all simulated renewals succeeded`.

> Внимание: при `--dry-run` хук перезагрузки nginx **не** выполняется — это нормально,
> Certbot не запускает deploy-хуки в тестовом режиме. Проверить сам скрипт можно вручную:
> ```bash
> sudo /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
> ```
> Должно напечатать «nginx перечитал сертификаты».

### 13.4. Автозапуск после перезагрузки сервера

Всё уже настроено (`restart: unless-stopped` у контейнера + `systemctl enable docker`),
но лучше убедиться лично:

```bash
sudo reboot
```

Подожди минуту, зайди снова (`ssh crm`) и проверь:

```bash
cd /opt/crm && docker compose ps
curl -I https://crmdetroid.ru
```

Сайт должен подняться сам, без единой команды.

---

## Итоговый чек-лист этапа 1

| # | Проверка | Команда | Ожидаемый результат |
|---|---|---|---|
| 1 | Вход по ключу | `ssh crm` | пускает без пароля |
| 2 | Root заблокирован | `ssh root@77.222.38.191` | Permission denied |
| 3 | Пароли отключены | `sudo /usr/sbin/sshd -T \| grep -i passwordauthentication` | `passwordauthentication no` |
| 4 | Файрвол | `sudo ufw status` | active, открыты 22/80/443 |
| 5 | fail2ban | `sudo fail2ban-client status sshd` | тюрьма активна |
| 6 | Автообновления | `systemctl is-enabled unattended-upgrades` | enabled |
| 7 | Docker | `docker run --rm hello-world` | Hello from Docker! |
| 8 | Compose | `docker compose version` | v2.x |
| 9 | Nginx 1.27 | `docker compose exec nginx nginx -v` | nginx/1.27.x |
| 10 | HTTPS | `curl -I https://crmdetroid.ru` | HTTP/2 200 |
| 11 | Редирект | `curl -I http://crmdetroid.ru` | 301 на https |
| 12 | Автопродление | `sudo certbot renew --dry-run` | simulated renewals succeeded |
| 13 | После ребута | `sudo reboot`, затем `curl -I https://crmdetroid.ru` | HTTP/2 200 |

---

## Приложение A. Частые проблемы

**`Connection refused` при выпуске сертификата**
Let's Encrypt не смог достучаться до порта 80. Проверь: `docker compose ps` (контейнер
запущен?), `sudo ufw status` (80 открыт?), и попробуй снаружи `curl -I http://crmdetroid.ru`.

**`DNS problem: NXDOMAIN looking up A for ...`**
Домен не указывает на сервер. Проверь `dig +short crmdetroid.ru` — должно быть
`77.222.38.191`. Если только что менял DNS — подожди и повтори.

**`unauthorized` / `404` при проверке ACME**
Проверь вручную:
```bash
echo test > /opt/crm/certbot/www/probe.txt
curl http://crmdetroid.ru/.well-known/acme-challenge/../probe.txt
```
Если файл не отдаётся — в конфиге nginx не тот `root` в блоке `acme-challenge`
(должен быть `/var/www/certbot`) или не смонтирован том `./certbot/www`.

**`docker: permission denied while trying to connect to the Docker daemon socket`**
Ты не перезашёл после `usermod -aG docker deploy`. Сделай `exit` и зайди заново.

**Потерян доступ по SSH (закрыл всё, ключ не работает)**
Заходи через **VNC-консоль в панели sweb.ru** (там вход по паролю root работает всегда),
затем временно верни пароли:
```bash
sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config.d/00-crm-hardening.conf
systemctl restart ssh.socket 2>/dev/null; systemctl restart ssh
```

**fail2ban забанил твой IP**
Через VNC-консоль: `fail2ban-client set sshd unbanip ТВОЙ_IP`.

**Порт 80 занят**
`sudo ss -tulpn | grep :80` — посмотри, кто держит, и останови/удали эту службу.

**Контейнер nginx не стартует**
`docker compose logs nginx --tail 50` — в логах будет точная строка конфига с ошибкой.

---

## Приложение Б. Вход с другого компьютера

После запрета паролей на сервер пускает только ключ. Чтобы зайти с нового компьютера,
нужно добавить его ключ в `~/.ssh/authorized_keys` пользователя `deploy`.
В файле может быть сколько угодно строк — **одна строка = один компьютер**.

### Способ 1 (правильный): отдельный ключ для каждого компьютера

1. На **новом** компьютере создаём ключ:
   ```powershell
   ssh-keygen -t ed25519 -C "crm-noutbuk" -f "$env:USERPROFILE\.ssh\id_ed25519_crm"
   Get-Content "$env:USERPROFILE\.ssh\id_ed25519_crm.pub"
   ```
   (macOS/Linux: `ssh-keygen -t ed25519 -C "crm-noutbuk" -f ~/.ssh/id_ed25519_crm && cat ~/.ssh/id_ed25519_crm.pub`)

2. Копируем показанную строку и со **старого** (уже работающего) компьютера добавляем её на сервер:
   ```powershell
   ssh crm "echo 'СТРОКА_КЛЮЧА_С_НОВОГО_ПК' >> ~/.ssh/authorized_keys && sort -u -o ~/.ssh/authorized_keys ~/.ssh/authorized_keys && cat ~/.ssh/authorized_keys"
   ```

3. Проверяем с нового компьютера:
   ```powershell
   ssh -i "$env:USERPROFILE\.ssh\id_ed25519_crm" deploy@77.222.38.191
   ```

Плюс способа: потерял ноутбук — удаляешь одну строку из `authorized_keys`, остальные
компьютеры продолжают работать.

### Способ 2 (быстрый): перенести существующий ключ

Скопировать **два файла** `id_ed25519_crm` и `id_ed25519_crm.pub` из папки `.ssh`
старого компьютера в такую же папку нового (флешкой или архивом с паролем — не мессенджером).

Если Windows после копирования ругается `UNPROTECTED PRIVATE KEY FILE`:
```powershell
icacls "$env:USERPROFILE\.ssh\id_ed25519_crm" /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

### Аварийный вход (ключей нет вообще)

В панели sweb.ru открыть **VNC-консоль** — это «монитор, подключённый к серверу»,
она не зависит от настроек SSH, и там работает вход под root по паролю. Далее:

```bash
# посмотреть/добавить ключ
nano /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# либо временно вернуть вход по паролю
sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config.d/00-crm-hardening.conf
systemctl restart ssh.socket 2>/dev/null; systemctl restart ssh
```

После восстановления доступа не забыть вернуть `PasswordAuthentication no`.

### Управление списком ключей

```bash
cat -n ~/.ssh/authorized_keys        # посмотреть все ключи с номерами строк
sed -i '2d' ~/.ssh/authorized_keys   # удалить доступ, записанный во 2-й строке
```

Комментарий в конце строки (`crm-noutbuk`, `crmdetroid`) нужен именно для того,
чтобы понимать, чей это компьютер.

---

## Приложение B. Команды на каждый день

```bash
cd /opt/crm

docker compose ps                       # что запущено и в каком состоянии
docker compose logs -f nginx            # живые логи nginx (выход: Ctrl+C)
docker compose restart nginx            # перезапустить контейнер
docker compose exec nginx nginx -t      # проверить конфиг
docker compose exec nginx nginx -s reload   # применить конфиг без простоя
docker compose down                     # остановить всё
docker compose up -d                    # поднять всё

sudo certbot certificates               # какие сертификаты есть и когда истекают
sudo ufw status numbered                # правила файрвола
sudo fail2ban-client status sshd        # кто забанен
df -h                                   # свободное место на диске
free -h                                 # память
docker system df                        # сколько места занимает Docker
docker system prune -f                  # почистить мусор Docker (безопасно)
```

---

## Что дальше

- **Этап 2** — фронтенд-макет: React 19 + Vite 6 + Tailwind v4, все страницы и маршруты
  из репозитория-источника, на моках, без бэкенда.
- **Этап 3** — скелет FastAPI: SQLAlchemy 2.0 async, Alembic, Celery, Valkey.
- **Этап 4** — полный `docker-compose.yml` (postgres 18, valkey 8, backend, worker,
  frontend, nginx), раскомментируем блоки `location /api/` и `location /` в конфиге
  nginx и задеплоим всё на `crmdetroid.ru`.

Файлы конфигурации из этого этапа лежат в репозитории в папке `deploy/` — на этапе 4
мы будем расширять именно их.
