// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract CRVoting {
    struct Candidate {
        string name;
        uint256 voteCount;
    }

    struct Voter {
        bool authorized;
        bool voted;
        uint256 voteIndex;
        string name;
        string enrollment;
        bool registered;
    }

    address public admin;
    string public electionName;
    bool public electionActive;

    Candidate[] public candidates;
    address[] public voterAddresses;
    mapping(address => Voter) public voters;

    event ElectionStarted();
    event ElectionEnded(string[] winnerNames, uint256 winnerVotes);
    event VoterAuthorized(address voter, bool status);
    event VoterRegistered(address voter, string name, string enrollment);
    event VoteCasted(address voter, uint256 candidateIndex);
    event ElectionReset(bool candidatesCleared);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    constructor(string memory _electionName) {
        admin = msg.sender;
        electionName = _electionName;
        electionActive = false;
    }

    function addCandidate(string memory _name) public onlyAdmin {
        require(!electionActive, "Cannot add candidates while election is active");
        candidates.push(Candidate({
            name: _name,
            voteCount: 0
        }));
    }

    function registerVoter(string memory _name, string memory _enrollment) public {
        require(!voters[msg.sender].registered, "Already registered");
        
        voters[msg.sender].registered = true;
        voters[msg.sender].name = _name;
        voters[msg.sender].enrollment = _enrollment;
        voters[msg.sender].authorized = false;
        
        voterAddresses.push(msg.sender);
        
        emit VoterRegistered(msg.sender, _name, _enrollment);
    }

    function setVoterAuthorization(address _voter, bool _status) public onlyAdmin {
        require(voters[_voter].registered, "Voter not registered");
        voters[_voter].authorized = _status;
        emit VoterAuthorized(_voter, _status);
    }

    function startElection() public onlyAdmin {
        require(candidates.length > 0, "No candidates added");
        electionActive = true;
        emit ElectionStarted();
    }

    function vote(uint256 _candidateIndex) public {
        require(electionActive, "Election is not active");
        require(voters[msg.sender].authorized, "Has not been authorized");
        require(!voters[msg.sender].voted, "Already voted");
        require(_candidateIndex < candidates.length, "Invalid candidate index");

        voters[msg.sender].voted = true;
        voters[msg.sender].voteIndex = _candidateIndex;
        candidates[_candidateIndex].voteCount++;

        emit VoteCasted(msg.sender, _candidateIndex);
    }

    function endElection() public onlyAdmin returns (string[] memory winnerNames, uint256 winnerVotes) {
        require(electionActive, "Election is not active");
        electionActive = false;

        uint256 maxVotes = 0;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].voteCount > maxVotes) {
                maxVotes = candidates[i].voteCount;
            }
        }

        if (maxVotes > 0) {
            uint256 count = 0;
            for (uint256 i = 0; i < candidates.length; i++) {
                if (candidates[i].voteCount == maxVotes) {
                    count++;
                }
            }

            winnerNames = new string[](count);
            uint256 index = 0;
            for (uint256 i = 0; i < candidates.length; i++) {
                if (candidates[i].voteCount == maxVotes) {
                    winnerNames[index] = candidates[i].name;
                    index++;
                }
            }
        } else {
            winnerNames = new string[](0);
        }

        winnerVotes = maxVotes;
        emit ElectionEnded(winnerNames, winnerVotes);
    }

    function resetElection(bool _clearCandidates) public onlyAdmin {
        require(!electionActive, "Cannot reset while election is active");
        
        // Reset all voters' voted status
        for (uint256 i = 0; i < voterAddresses.length; i++) {
            voters[voterAddresses[i]].voted = false;
            voters[voterAddresses[i]].voteIndex = 0;
        }

        if (_clearCandidates) {
            delete candidates;
        } else {
            // Just reset vote counts
            for (uint256 i = 0; i < candidates.length; i++) {
                candidates[i].voteCount = 0;
            }
        }

        emit ElectionReset(_clearCandidates);
    }

    function getCandidates() public view returns (Candidate[] memory) {
        return candidates;
    }

    function getVoterAddresses() public view returns (address[] memory) {
        return voterAddresses;
    }
}
