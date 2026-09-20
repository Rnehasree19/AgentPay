import { userPolicyRepository } from "../../repositories/userPolicyRepository.js";

export const DEFAULT_USER_POLICY = Object.freeze({
  currency: "INR",
  maxTransactionAmountPaise: 10000000,
  approvalRequiredAbovePaise: 5000000,
  active: true,
});

export class UserPolicyService {
  constructor({ policies = userPolicyRepository } = {}) {
    this.policies = policies;
  }

  async ensureDefaultUserPolicy(userId) {
    const existing = await this.policies.findByUserId(userId);
    if (existing) {
      return existing;
    }

    try {
      return await this.policies.create({ userId, ...DEFAULT_USER_POLICY });
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }

      const raced = await this.policies.findByUserId(userId);
      if (raced) {
        return raced;
      }

      throw error;
    }
  }
}

export default UserPolicyService;