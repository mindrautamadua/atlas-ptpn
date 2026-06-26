import 'dotenv/config'
import { SignJWT } from 'jose'

const uid = Number(process.argv[2] ?? 194)
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? 'dev-insecure-secret-change-me')
const token = await new SignJWT({ uid })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('30d')
  .sign(secret)
process.stdout.write(token)
