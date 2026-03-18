const CRVoting = artifacts.require("CRVoting");

module.exports = function (deployer) {
    deployer.deploy(CRVoting, "Class Representative Election 2025");
};
