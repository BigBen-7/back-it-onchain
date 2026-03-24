"use client";

import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
  WalletDropdownLink,
} from "@coinbase/onchainkit/wallet";
import {
  Address,
  Avatar,
  Name,
  Identity,
  EthBalance,
} from "@coinbase/onchainkit/identity";
import { useAccount } from "wagmi";

import { ChainSelector } from "./ChainSelector";
import { NotificationBell } from "./NotificationBell";
import { useChain } from "./ChainProvider";
import { useStellarWallet } from "./StellarWalletProvider";

import { useTranslations } from "next-intl";

export function Navbar() {
  const t = useTranslations("Navbar");
  const { address: evmAddress, isConnected: isEvmConnected } = useAccount();
  const { selectedChain } = useChain();
  const { publicKey: stellarAddress, isConnected: isStellarConnected } = useStellarWallet();

  const address = selectedChain === "stellar" ? stellarAddress : evmAddress;
  const isConnected = selectedChain === "stellar" ? isStellarConnected : isEvmConnected;

  return (
    <div className="flex justify-between items-center py-4 px-6 bg-white shadow-sm mb-8">
      <div className="text-xl font-bold text-indigo-600">{t("title")}</div>
      <div className="flex items-center gap-4">
        <ChainSelector />
        {isConnected && address && <NotificationBell userWallet={address} />}
        <Wallet>
          <ConnectWallet>
            <Avatar className="h-6 w-6" />
            <Name />
          </ConnectWallet>
          <WalletDropdown>
            <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
              <Avatar />
              <Name />
              <Address />
              <EthBalance />
            </Identity>
            <WalletDropdownLink
              icon="link"
              href="https://wallet.coinbase.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("wallet_settings")}
            </WalletDropdownLink>
            <WalletDropdownDisconnect />
          </WalletDropdown>
        </Wallet>
      </div>
    </div>
  );
}
