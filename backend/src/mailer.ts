import net from 'net';
import tls from 'tls';
import crypto from 'crypto';

type MailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  testRecipient: string;
};

function getSmtpConfig(): SmtpConfig {
  const user = String(process.env.EMAIL_SMTP_USER || '').trim();
  return {
    host: String(process.env.EMAIL_SMTP_HOST || '').trim(),
    port: Number(process.env.EMAIL_SMTP_PORT || 465),
    secure: String(process.env.EMAIL_SMTP_SECURE || 'true').toLowerCase() !== 'false',
    user,
    pass: String(process.env.EMAIL_SMTP_PASS || '').trim(),
    from: String(process.env.EMAIL_FROM || user || '').trim(),
    testRecipient: String(process.env.EMAIL_TEST_RECIPIENT || '').trim(),
  };
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function parseAddress(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*)<([^>]+)>$/);
  if (!match) return { header: trimmed, address: trimmed };
  const name = match[1].trim().replace(/^"|"$/g, '');
  const address = match[2].trim();
  return { header: `${encodeHeader(name)} <${address}>`, address };
}

function escapeBody(value: string) {
  return value.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function buildMessage(config: SmtpConfig, payload: MailPayload, envelopeTo: string) {
  const from = parseAddress(config.from);
  const boundary = `traffic_${crypto.randomBytes(12).toString('hex')}`;
  const messageId = `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@traffic-system.local>`;
  const targetNote = envelopeTo === payload.to ? '' : `\n\n测试投递：原始目标邮箱 ${payload.to}，实际投递到 ${envelopeTo}。`;

  return [
    `From: ${from.header}`,
    `To: ${envelopeTo}`,
    `Subject: ${encodeHeader(payload.subject)}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    escapeBody(`${payload.text}${targetNote}`),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    escapeBody(
      envelopeTo === payload.to
        ? payload.html
        : `${payload.html}<p style="color:#64748b">测试投递：原始目标邮箱 ${payload.to}，实际投递到 ${envelopeTo}。</p>`
    ),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

function createSmtpClient(config: SmtpConfig) {
  const socket = config.secure
    ? tls.connect({ host: config.host, port: config.port, servername: config.host })
    : net.connect({ host: config.host, port: config.port });

  socket.setTimeout(15000);
  socket.setEncoding('utf8');

  let buffer = '';
  const lineQueue: string[] = [];
  const pending: Array<(line: string) => void> = [];

  const pushLine = (line: string) => {
    const next = pending.shift();
    if (next) next(line);
    else lineQueue.push(line);
  };

  socket.on('data', (chunk) => {
    buffer += chunk;
    while (buffer.includes('\r\n')) {
      const idx = buffer.indexOf('\r\n');
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      pushLine(line);
    }
  });

  const waitLine = () => new Promise<string>((resolve, reject) => {
    const queued = lineQueue.shift();
    if (queued !== undefined) {
      resolve(queued);
      return;
    }
    const onError = (err: Error) => {
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      reject(err);
    };
    const onTimeout = () => {
      socket.off('error', onError);
      reject(new Error('SMTP 响应超时'));
    };
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
    pending.push((line) => {
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      resolve(line);
    });
  });

  const readResponse = async () => {
    const lines: string[] = [];
    while (true) {
      const line = await waitLine();
      lines.push(line);
      if (/^\d{3} /.test(line)) return lines.join('\n');
    }
  };

  const send = async (command: string, expected: number[]) => {
    socket.write(`${command}\r\n`);
    const response = await readResponse();
    const code = Number(response.slice(0, 3));
    if (!expected.includes(code)) {
      throw new Error(`SMTP 命令失败：${command.split(' ')[0]}，响应：${response}`);
    }
    return response;
  };

  return { socket, readResponse, send };
}

export function isMailConfigured() {
  const config = getSmtpConfig();
  return Boolean(config.host && config.user && config.pass && config.from);
}

export async function sendMail(payload: MailPayload) {
  const config = getSmtpConfig();
  if (!isMailConfigured()) {
    throw new Error('邮件服务未配置：请设置 EMAIL_SMTP_HOST、EMAIL_SMTP_USER、EMAIL_SMTP_PASS、EMAIL_FROM');
  }

  const envelopeTo = config.testRecipient || payload.to;
  const from = parseAddress(config.from);
  const client = createSmtpClient(config);

  try {
    let response = await client.readResponse();
    if (!response.startsWith('220')) throw new Error(`SMTP 连接失败：${response}`);
    await client.send(`EHLO ${process.env.EMAIL_SMTP_HELO || 'traffic-system.local'}`, [250]);
    await client.send('AUTH LOGIN', [334]);
    await client.send(Buffer.from(config.user).toString('base64'), [334]);
    await client.send(Buffer.from(config.pass).toString('base64'), [235]);
    await client.send(`MAIL FROM:<${from.address}>`, [250]);
    await client.send(`RCPT TO:<${envelopeTo}>`, [250, 251]);
    await client.send('DATA', [354]);
    client.socket.write(`${buildMessage(config, payload, envelopeTo)}\r\n.\r\n`);
    response = await client.readResponse();
    if (!response.startsWith('250')) throw new Error(`SMTP DATA 失败：${response}`);
    await client.send('QUIT', [221]).catch(() => null);
    return { deliveredTo: envelopeTo };
  } finally {
    client.socket.end();
  }
}

export async function sendVerificationEmail(to: string, code: string) {
  return sendMail({
    to,
    subject: '智能交通系统邮箱验证码',
    text: `你的验证码是：${code}。验证码 10 分钟内有效，请勿转发给他人。`,
    html: `
      <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#0f172a">
        <h2 style="margin:0 0 12px">智能交通系统邮箱验证码</h2>
        <p>你的验证码是：</p>
        <div style="font-size:28px;font-weight:800;letter-spacing:6px;margin:16px 0;color:#2563eb">${code}</div>
        <p style="color:#64748b">验证码 10 分钟内有效，请勿转发给他人。</p>
      </div>
    `,
  });
}
