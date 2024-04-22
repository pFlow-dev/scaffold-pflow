import { TicTacToe } from "../typechain-types";
import { ethers } from "hardhat";

describe("YourContract", function () {
  // We define a fixture to reuse the same setup in every test.

  let yourContract: TicTacToe;
  before(async () => {
    const [, p1, p2] = await ethers.getSigners();
    const yourContractFactory = await ethers.getContractFactory("TicTacToe");
    yourContract = (await yourContractFactory.deploy(p1, p2)) as TicTacToe;
    await yourContract.waitForDeployment();
  });

  describe("Deployment", function () {
    xit("Should have the right message on deploy", async function () {
      // expect(await yourContract.greeting()).to.equal("Building Unstoppable Apps!!!");
    });

    xit("Should allow setting a new message", async function () {
      // const newGreeting = "Learn Scaffold-ETH 2! :)";
      // await yourContract.setGreeting(newGreeting);
      // expect(await yourContract.greeting()).to.equal(newGreeting);
    });
  });
});
