import type { ServerConfig, PaymentProtocol } from '../types.js';
import { X402Server } from '../protocols/x402/server.js';
import { MPPServer } from '../protocols/mpp/server.js';

/**
 * Unified payment server that can handle both x402 and MPP protocols
 */
export class PaymentServer {
  private x402Server?: X402Server;
  private mppServer?: MPPServer;
  private enabledProtocols: Set<PaymentProtocol>;

  constructor(config: ServerConfig) {
    this.enabledProtocols = new Set(config.protocols ?? ['x402', 'mpp']);

    // Initialize protocol servers based on config
    if (this.enabledProtocols.has('x402')) {
      this.x402Server = new X402Server({
        privateKey: config.privateKey!,
        recipient: config.recipient,
        asset: config.asset,
        decimals: config.decimals,
        chainId: config.chainId,
        rpcUrl: config.rpcUrl,
        feePayer: config.feePayer,
        timeoutSeconds: config.timeoutSeconds,
      });
    }

    if (this.enabledProtocols.has('mpp')) {
      this.mppServer = new MPPServer({
        privateKey: config.privateKey!,
        recipient: config.recipient,
        asset: config.asset,
        decimals: config.decimals,
        chainId: config.chainId,
        rpcUrl: config.rpcUrl,
        feePayer: config.feePayer,
        timeoutSeconds: config.timeoutSeconds,
      });
    }

    if (this.enabledProtocols.size === 0) {
      throw new Error('At least one protocol must be enabled');
    }
  }

  /**
   * Create payment challenge/requirements for both protocols
   */
  createPaymentChallenge(
    amount: string,
    options?: {
      realm?: string;
      description?: string;
      url?: string;
      protocol?: PaymentProtocol; // Force specific protocol
    }
  ): {
    x402?: ReturnType<X402Server['createPaymentRequired']>;
    mpp?: ReturnType<MPPServer['createChallenge']>;
  } {
    const result: any = {};

    // If specific protocol requested, use only that
    if (options?.protocol) {
      if (options.protocol === 'x402' && this.x402Server) {
        result.x402 = this.x402Server.createPaymentRequired(amount, {
          description: options.description,
          url: options.url,
        });
      } else if (options.protocol === 'mpp' && this.mppServer) {
        result.mpp = this.mppServer.createChallenge(amount, {
          realm: options.realm,
          description: options.description,
        });
      }
      return result;
    }

    // Create challenges for all enabled protocols
    if (this.x402Server) {
      result.x402 = this.x402Server.createPaymentRequired(amount, {
        description: options?.description,
        url: options?.url,
      });
    }

    if (this.mppServer) {
      result.mpp = this.mppServer.createChallenge(amount, {
        realm: options?.realm,
        description: options?.description,
      });
    }

    return result;
  }

  /**
   * Express.js middleware that handles both protocols
   */
  middleware() {
    return async (req: any, res: any, next: any) => {
      // Check for x402 payment (POST with x402Version in body)
      if (req.method === 'POST' && req.body?.x402Version && this.x402Server) {
        const x402Middleware = this.x402Server.middleware();
        return x402Middleware(req, res, next);
      }

      // Check for MPP payment (Authorization header)
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Payment ') && this.mppServer) {
        const mppMiddleware = this.mppServer.middleware();
        return mppMiddleware(req, res, next);
      }

      // No payment attempt, return appropriate challenge(s)
      const amount = req.query.amount || req.body?.amount;
      if (!amount) {
        return res.status(400).json({ error: 'Amount required' });
      }

      const challenges = this.createPaymentChallenge(amount, {
        url: req.originalUrl || req.url,
        description: req.query.description,
      });

      // If only one protocol enabled, return its format
      if (this.enabledProtocols.size === 1) {
        if (challenges.x402) {
          return res.status(402).json(challenges.x402.body);
        }
        if (challenges.mpp) {
          return res.status(402).set(challenges.mpp.headers).json({
            error: 'Payment required',
          });
        }
      }

      // Both protocols enabled - prefer MPP (header-based) but include x402 in body
      if (challenges.mpp && challenges.x402) {
        // Set MPP headers
        res.set(challenges.mpp.headers);
        
        // Return x402 body format with added MPP info
        const body = {
          ...challenges.x402.body,
          mpp: {
            challenge: challenges.mpp.challenge,
          },
        };

        return res.status(402).json(body);
      }

      return res.status(500).json({ error: 'No payment protocols configured' });
    };
  }

  /**
   * Get the underlying x402 server for advanced usage
   */
  getX402Server(): X402Server | undefined {
    return this.x402Server;
  }

  /**
   * Get the underlying MPP server for advanced usage
   */
  getMPPServer(): MPPServer | undefined {
    return this.mppServer;
  }

  /**
   * Check which protocols are enabled
   */
  getEnabledProtocols(): PaymentProtocol[] {
    return Array.from(this.enabledProtocols);
  }
}