const RegisterUserUseCase = require('../../application/use-cases/RegisterUserUseCase');

class RegistrationController {
  constructor(registerUserUseCase = null) {
    this.registerUserUseCase = registerUserUseCase || new RegisterUserUseCase();
  }

  async registerWithRole(req, res, roleName) {
    try {
      const { phoneNumber, firstName, lastName, email, password, countryId, preferredCurrencyId } = req.body || {};

      if (!phoneNumber || !firstName || !lastName || !password) {
        return res.status(400).json({
          success: false,
          status_code: 400,
          message: 'phoneNumber, firstName, lastName, and password are required',
        });
      }

      const result = await this.registerUserUseCase.execute({
        phoneNumber,
        firstName,
        lastName,
        email,
        password,
        role: roleName,
        countryId,
        preferredCurrencyId,
      });

      return res.status(201).json({
        success: true,
        status_code: 201,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        status_code: 400,
        message: error.message || 'Registration failed',
      });
    }
  }

  async register(req, res) {
    try {
      const { phoneNumber, firstName, lastName, email, password, role, countryId, preferredCurrencyId } = req.body || {};

      if (!phoneNumber || !firstName || !lastName || !password) {
        return res.status(400).json({
          success: false,
          status_code: 400,
          message: 'phoneNumber, firstName, lastName, and password are required',
        });
      }

      const result = await this.registerUserUseCase.execute({
        phoneNumber,
        firstName,
        lastName,
        email,
        password,
        role,
        countryId,
        preferredCurrencyId,
      });

      return res.status(201).json({
        success: true,
        status_code: 201,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        status_code: 400,
        message: error.message || 'Registration failed',
      });
    }
  }

  async registerSeller(req, res) {
    return this.registerWithRole(req, res, 'seller');
  }

  async registerAdvertiser(req, res) {
    return this.registerWithRole(req, res, 'advertiser');
  }
}

module.exports = RegistrationController;