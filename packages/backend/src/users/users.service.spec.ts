import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from './user.entity';
import { UserFollows } from './user-follows.entity';
import { UserSettings } from './user-settings.entity';
import { ConflictException } from '@nestjs/common';
import { NotificationEventsService } from '../notifications/notification-events.service';

describe('UsersService', () => {
  let service: UsersService;
  let usersRepo: jest.Mocked<Repository<User>>;
  let followsRepo: jest.Mocked<Repository<UserFollows>>;
  let settingsRepo: jest.Mocked<Partial<Repository<UserSettings>>>;

  const mockUsersRepo = () => ({
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  });

  const mockFollowsRepo = () => ({
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  });

  const mockSettingsRepo = () => ({
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    save: jest.fn().mockResolvedValue({}),
  });

  const mockNotificationService = {
    emitNewFollower: jest.fn(),
  };

  /** Minimal DataSource mock — only the methods used by exportHistory */
  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue({
      connect: jest.fn().mockResolvedValue(undefined),
      stream: jest.fn().mockResolvedValue({ on: jest.fn(), pipe: jest.fn() }),
      release: jest.fn().mockResolvedValue(undefined),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useFactory: mockUsersRepo,
        },
        {
          provide: getRepositoryToken(UserFollows),
          useFactory: mockFollowsRepo,
        },
        {
          provide: getRepositoryToken(UserSettings),
          useFactory: mockSettingsRepo,
        },
        {
          provide: NotificationEventsService,
          useValue: mockNotificationService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    usersRepo = module.get(getRepositoryToken(User));
    followsRepo = module.get(getRepositoryToken(UserFollows));
    settingsRepo = module.get(getRepositoryToken(UserSettings));
  });

  describe('findByWallet (findOneByAddress)', () => {
    it('should return a user if found', async () => {
      const user = { wallet: '0x123' } as User;
      usersRepo.findOne.mockResolvedValue(user);

      const result = await service.findByWallet('0x123');

      expect(result).toEqual(user);
      expect(usersRepo.findOne).toHaveBeenCalledWith({
        where: { wallet: '0x123' },
      });
    });

    it('should return null if not found', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      const result = await service.findByWallet('0x123');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const dto = { wallet: '0x123', handle: 'test' };
      usersRepo.findOne.mockResolvedValue(null); // no existing wallet
      usersRepo.create.mockReturnValue(dto as User);
      usersRepo.save.mockResolvedValue(dto as User);

      const result = await service.create(dto);

      expect(result).toEqual(dto);
      expect(usersRepo.create).toHaveBeenCalledWith(dto);
      expect(usersRepo.save).toHaveBeenCalled();
    });

    it('should throw if wallet already exists', async () => {
      usersRepo.findOne.mockResolvedValue({ wallet: '0x123' } as User);

      await expect(
        service.create({ wallet: '0x123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw if handle is taken', async () => {
      usersRepo.findOne
        .mockResolvedValueOnce(null) // wallet check
        .mockResolvedValueOnce({ handle: 'test' } as User); // handle check

      await expect(
        service.create({ wallet: '0x123', handle: 'test' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateProfile', () => {
    it('should update user profile', async () => {
      const user = { wallet: '0x123', handle: 'old' } as User;

      usersRepo.findOne.mockResolvedValue(user);
      usersRepo.save.mockResolvedValue({
        ...user,
        handle: 'new',
      } as User);

      const result = await service.updateProfile('0x123', {
        handle: 'new',
      });

      expect(result.handle).toBe('new');
      expect(usersRepo.save).toHaveBeenCalled();
    });

    it('should throw if user not found', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateProfile('0x123', { handle: 'new' }),
      ).rejects.toThrow('User not found');
    });

    it('should throw if handle is already taken', async () => {
      const user = { wallet: '0x123', handle: 'old' } as User;

      jest
        .spyOn(service, 'findByWallet')
        .mockResolvedValue(user);

      jest
        .spyOn(service, 'findByHandle')
        .mockResolvedValue({ wallet: '0x456' } as User);

      await expect(
        service.updateProfile('0x123', { handle: 'taken' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
